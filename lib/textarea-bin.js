#!/usr/bin/env node

fs = require('fs');
tty = require('tty');

process.stdin.resume();
process.stdin.setEncoding('utf8');
tty.setRawMode(true);


process.stdin.on('data', function (chunk) {
	// need to have control codes and buffering
	msg = JSON.parse(chunk);
	if(msg.method === 'close'){
		close();
	} else if (msg.method === 'save') {
		save(msg.data);
	}
});

process.on('SIGINT', function () {
	console.log('Press the close button to quit.');
});

fs.readFile(process.argv[2], function (err, data) {
	load(data.toString());
});

// on events from browser
//write
function save(data){
	fs.writeFile(process.argv[2], data, function (err) {
		console.log('saved');
	});
}
//close
function close(){
	console.log('bye');
	process.exit();
}


// send events to browser
function load(data){
	sendMessage({plugin:'textarea','method':'load','data':data});
}


// Api
function sendMessage(data){
	process.stdout.write('\u001B]99;' + JSON.stringify(data) + '\u0007');
}
