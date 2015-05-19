#!/usr/bin/env node

var http = require('http');
var url = require('url');
var util = require('util');

// 3rd party
var blessed = require('blessed');


// Create a screen object.
var screen = blessed.screen({
    autoPadding: true,
    smartCSR: true
});

screen.title = 'KCRW';

// Create player box.
var box = blessed.box({
    top: 'center',
    left: 'left',
    width: '100%',
    height: '100%',
    content: '{center}{magenta-bg}{yellow-fg} KCRW PLAYER {/yellow-fg}{/magenta-bg}{/center}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        border: {
            fg: '#a0a0a0'
        },
    }
});

// track list
var list = blessed.list({
    parent: box,
    width: '95%',
    height: '88%',
    top: 'center',
    left: 2,
    align: 'left',
    selectedBg: 'black',
    // Allow mouse support
    mouse: true,
    // Allow key support (arrow keys + enter)
    keys: true,
    // Use vi built-in keys
    vi: true
});

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

// Append our box to the screen.
screen.append(box);

// http://nodejs.org/api.html#_child_processes
var sys = require('sys')
var exec = require('child_process').exec;
var child;

// --- volume controls -/+ ---
box.key('-', function(ch, key) {
    child = exec("amixer -D pulse sset Master 10%-", function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
});
box.key('+', function(ch, key) {
    child = exec("amixer -D pulse sset Master 10%+", function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
});
// --- volume controls end ---

list.focus();
screen.render();

// ---- streaming ----

// 3rd party
var lame = require('lame');
var Speaker = require('speaker');
var Promise = require('bluebird');

var packageInfo = require('./package.json');

var STREAM_URL = 'http://kcrw.ic.llnwd.net/stream/kcrw_music';
var NOW_PLAYING_URL = 'http://www.kcrw.com/now_playing.json?channel=kcrwmusic';

var USER_AGENT = util.format('node-kcrw (%s)', packageInfo.version);
console.log(USER_AGENT)


get(STREAM_URL, function(res) {
	res.pipe(new lame.Decoder())
	   .pipe(new Speaker());

	printLatestTrack();
});


// get the width of terminal, or default
function columnWidth() {
	if (process && process.stdout && !isNaN(process.stdout.columns)) {
		return process.stdout.columns;
	}
	return 80;
}

// wrap up HTTP get requests with a user agent
function get(uri, callback) {
	var parsed = url.parse(uri);
	var options = {
		protocol: parsed.protocol,
		auth: parsed.auth,
		hostname: parsed.hostname,
		path: parsed.path,
		port: parsed.port,
		headers: {
			'User-agent': USER_AGENT
		}
	}
	return http.get(options, callback);
}

// returns a promise, wrapping our get() fn
function getAnd(uri) {
	return new Promise(function(resolve, reject) {
		var req = get(uri, function(res) {
			var data = '';

			res.on('data', function(chunk) {
				data += chunk;
			});

			res.on('end', function() {
				resolve(data);
			});
		})

		req.on('error', function(err) {
			reject(err);
		});
	});
}

// calls checkLatest recursively internally
function printLatestTrack() {
    var currentTitle = null;
    var songListURL = null;
    var listItems = null;

    checkLatest();

    function checkLatest() {
    	Promise.all([
    		getAnd(NOW_PLAYING_URL)
    	]).spread( function(nowPlayingData) {
    		var nowPlaying = JSON.parse(nowPlayingData);
            songListURL = nowPlaying['songlist'];

    	    Promise.all([
                getAnd(songListURL)
            ]).spread( function(songlistData) {
                var songList = JSON.parse(songlistData);

                // check for track change
                if (songList[0]['title'] != currentTitle ) {
    		        currentTitle = songList[0]['title'];

                    listItems = [];
                    for (var i = 0; i < songList.length; i++) {
                        listItems[i] = util.format('%s. %s - %s', i+1, songList[i]['title'], songList[i]['artist']);
                    }
                    list.setItems(listItems);

                    // render screen
                    screen.render();
                    setTimeout(checkLatest, 30*1000);
                    return;
    		    } else {
    		        // track is unchanged, check again soon
                    setTimeout(checkLatest, 5000);
                    return;
                }
            });
    	});
    }
}
