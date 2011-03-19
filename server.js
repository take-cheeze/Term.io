#!/usr/bin/env node
"use strict";
require.paths.push(__dirname+"/static");
var _ = require('underscore-min.js');
var Term = require('term.js');
var spawn = require('child_process').spawn;
var fs = require('fs');
var connect = require('connect');
var io = require('socket.io');
var noop = function(){};

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
var io = io.listen(server,{log:noop});
server.use(function(req, res, next){
    if (/^\/\w+$/.test(req.url)) {
        req.url = '/';
    }
    next();
});
server.use(connect['static'](__dirname + '/static'));


function TerminalSession(id){
	if ( this instanceof TerminalSession ) {
		this.connections = 0;
		this.id = id;
		this.termProcess = spawn(command,commandArgs);
		this.term = new Term();
	} else {
		return new TerminalSession(id);
	}
}

TerminalSession.prototype = {
	
	constructor: TerminalSession,
	
	newClient: function(client){
		this.connections++;
		
		var self = this;
		this.termProcess.stdout.on('data', function(data) {
			client.send(data.toString());
			self.term.write(data);
			//console.log(self.term.getScreenAsText())
		});
		
		client.termSession = this;
		client.initialized = true;
	},
	
	clientDisconnect: function(client){
		this.connections--;
		if(this.connections === 0){
			process.nextTick(function () {
				client.termSession.termProcess.kill();
				delete termSessions[client.termSession.id];
			});
		}
		client.initialized = false;
	},
	
	handleMessage: function(client, msgText){
		this.termProcess.stdin.write(msgText);
	}
};


io.on('connection', function(client){
	client.initialized = false;
	client.on('message', function(data){
		//The first message sent by the client must be the term they want
		if(!client.initialized){
			var id = data;
			if(!(id in termSessions)){
				termSessions[id] = new TerminalSession(id);
			}
			termSessions[id].newClient(client);
			console.log('Connection open on ' + data + ' (' + termSessions[id].connections + ' connected)');
		}
		else{
			client.termSession.handleMessage(client, data);
		}
	});
	client.on('disconnect', function(){
		client.termSession.clientDisconnect(client);
		console.log('Connection closed on ' + client.termSession.id + ' ('+client.termSession.connections+' connected)');		
	});
});

console.log('Ready to accept connections at http'+(config.ssl.on?'s':'')+'://localhost:'+config.port);
