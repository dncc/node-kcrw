#!/usr/bin/env node

var http = require('http');
var url = require('url');
var util = require('util');

// 3rd party
var blessed = require('blessed');
var lame = require('lame');
var Speaker = require('speaker');
var Promise = require('bluebird');

// Create a screen object.
var screen = blessed.screen({
  autoPadding: true,
  smartCSR: true
});

screen.title = 'KCRW';

// Create a box perfectly centered horizontally and vertically.
var box = blessed.box({
  top: 'center',
  left: 'left',
  width: '100%',
  height: '100%',
  content: '{center}{yellow-fg} KCRW PLAYER {/yellow-fg}{/center}',
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'magenta',
    border: {
      fg: '#f0f0f0'
    },
  },
  scrollable: true
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
    screen.render();
});
box.key('+', function(ch, key) {
    child = exec("amixer -D pulse sset Master 10%+", function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
    screen.render();
});
// --- volume controls end ---

// Focus our element.
box.focus();

// ---- render screen ----
screen.render();

// ---- streaming ----

// package.json info
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


/* Hoisted functions only */

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
			    // check for host change
			    var title = songList[0]['title'];
			    var artist = songList[0]['artist'];

			    if (title != currentTitle) {
			        currentTitle = title;

			        var sep = Array(columnWidth()+1).join('=');


                    for (var i = songList.length-1; i >= 0; i--) {
                        box.insertLine(1, util.format('%s. %s - %s', i+1, songList[i]['title'], songList[i]['artist']));
                    }

                    box.insertLine(1, "---");
                    box.insertLine(1, util.format("Current Track: %s (%s)", title, artist) );
                    box.insertLine(1, "");
                    box.insertLine(1, 'KCRW: Member supported independent public radio - http://kcrw.com/join' );
                    box.insertLine(1, "---");

                    // ---- render screen ----
                    screen.render();
			    }
			    // track is unchanged, check again soon
                else {
                    setTimeout(checkLatest, 10*1000);
                    return;
                }
            });

			// if no songlist key in now playing data,
			// then track listing is wrong (could eventually use the segments part)
			// so we skip the rest, check again a bit later
			if (nowPlaying.songlist === null) {
				setTimeout(checkLatest, 30*1000);
				return;
			}

		});
	}
}
