#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding('utf8');

requestPermissions();

process.stdin.on('data', function (chunk) {
	// need to buffer and split on \n
	notify(chunk);
});

function sendMessage(data){
	process.stdout.write('\u001B]99;' + JSON.stringify(data) + '\u0007');
}

function notify(data){
	sendMessage({plugin:'notify','method':'notify','data':data});
}

function requestPermissions(){
	sendMessage({plugin:'notify','method':'requestPermissions','data':''});
}