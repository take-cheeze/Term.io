#!/usr/bin/env node

fs = require('fs');
tty = require('tty');
mime = require('mime');

imageMime = mime.lookup(process.argv[2]);
imageBuffer = fs.readFileSync(process.argv[2]);
imageBase64 = imageBuffer.toString('base64');
load('data:'+imageMime+';base64,'+imageBase64);
// load('data:image/gif;base64,R0lGODlhEAAOALMAAOazToeHh0tLS/7LZv/0jvb29t/f3//Ub//ge8WSLf/rhf/3kdbW1mxsbP//mf///yH5BAAAAAAALAAAAAAQAA4AAARe8L1Ekyky67QZ1hLnjM5UUde0ECwLJoExKcppV0aCcGCmTIHEIUEqjgaORCMxIC6e0CcguWw6aFjsVMkkIr7g77ZKPJjPZqIyd7sJAgVGoEGv2xsBxqNgYPj/gAwXEQA7');

// send events to browser
function load(dataurl){
	sendMessage({plugin:'imshow','method':'load','dataurl':dataurl});
}

// Api
function sendMessage(data){
	process.stdout.write('\u001B]99;' + JSON.stringify(data) + '\u0007');
}
