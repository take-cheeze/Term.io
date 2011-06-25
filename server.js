#!/usr/bin/env node
"use strict";

var fs = require('fs');
var child_process = require('child_process');

var connect = require('connect');
var socketio = require('socket.io');
var _ = require('underscore');

require.paths.push(__dirname+"/public");
require.paths.push(__dirname+"/lib");
var TerminalSession = require('TerminalSession.js').TerminalSession;

var command = 'python';
var commandArgs = ['-c', 'import pty;pty.spawn(["bash","-l"])'];


function startServer(config){

	var server;
	var termSessions = {};

	if(config.ssl.on){
		server = connect({
			key: fs.readFileSync(config.ssl.keyPath),
			cert: fs.readFileSync(config.ssl.certPath)
		});
	} else {
		server = connect();
	}

	server.listen(config.port);
	var io = socketio.listen(server,{log: function(){}});
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
}

try{
	var config = JSON.parse(fs.readFileSync("config.json"));
}
catch(err){
	try{
		console.log('First run: Copying config-sample.json to config.json.');
		console.log('Edit config.json to change options.');
		child_process.exec('cp config-sample.json config.json');
		var config = JSON.parse(fs.readFileSync("config-sample.json"));
	}
	catch(err){
		console.log("Could not load config file.");
		process.exit();
	}
}
startServer(config);

// child_process.exec('./lib/ssl-keygen.sh');

// process.on('uncaughtException', function (err) {
//   console.log('Caught exception: ' + err);
// });

console.log('Ready to accept connections at http'+(config.ssl.on?'s':'')+'://localhost:'+config.port);
