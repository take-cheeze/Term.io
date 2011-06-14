#!/usr/bin/env node
"use strict";

var fs = require('fs');

var connect = require('connect');
var io = require('socket.io');

var _ = require('underscore');

require.paths.push(__dirname+"/public");
require.paths.push(__dirname+"/lib");
var TerminalSession = require('TerminalSession.js').TerminalSession;

try{
	var config = JSON.parse(fs.readFileSync("config.json"));
}
catch(err){
	console.log("copy config-sample.json to config.json and make changes to configure");
	process.exit();
}

var command = 'python';
var commandArgs = ['-c', 'import pty;pty.spawn(["bash","-l"])'];
var termSessions = {};
var server;

if(config.ssl.on){
	server = connect({
		key: fs.readFileSync(config.ssl.keyPath),
		cert: fs.readFileSync(config.ssl.certPath)
	});
} else {
	server = connect();
}

server.listen(config.port);
var io = io.listen(server,{log: function(){}});
server.use(function(req, res, next){
	if (req.url === '/') {
		res.writeHead(302, { 'Location': '/'+(_.size(termSessions) + 1) });
		res.end();
    } else {
		next();
	}
});
server.use(function(req, res, next){
    if (/^\/\w+$/.test(req.url)) {
        req.url = '/';
    }
    next();
});
server.use(connect['static'](__dirname + '/public'));

io.on('connection', function(client){
	
	client.on('message', function(msgText){
		var msg = JSON.parse(msgText);

		if(msg.method === "init"){
			var id = msg.data.id;
			if(!(id in termSessions)){
				termSessions[id] = new TerminalSession(command, commandArgs, termSessions, msg.data);
			}
			termSessions[id].newClient(client);
			// console.log(id + ': connection open (' + termSessions[id].clients.length + ' connected)');
		}
		else{
			client.termSession.handleMessage(client, msg);
		}
	});
	
	client.on('disconnect', function(){
		client.termSession.clientDisconnect(client);
		// console.log(client.termSession.id + ': connection closed ('+client.termSession.clients.length+' connected)');		
	});
	
});

// process.on('uncaughtException', function (err) {
//   console.log('Caught exception: ' + err);
// });

console.log('Ready to accept connections at http'+(config.ssl.on?'s':'')+'://localhost:'+config.port);
