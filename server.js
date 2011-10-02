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


function startServer(config){
    global.config = config;

    var command = 'python';
    var commandArgs = ['-c', 'import pty;pty.spawn(["' + config.shell + '","-l"])'];

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
	var io = socketio.listen(server);
	io.configure(function(){
        // io.disable('Logger');
        io.enable('force new connection');
		io.set('log level', -1);
        io.set('heartbeat interval', 10);
        io.set('transports', [
                 'websocket'
               , 'htmlfile'
               , 'xhr-polling'
               , 'jsonp-polling'
               ]);
    });
	server.use(function(req, res, next){
		if (req.url === '/') {
			res.writeHead(302, { 'Location': '/'+
                                 (function(input) {
                                      for(var i in input) {
                                          if(config.save_session && input[i] !== undefined) return i;
                                          if(input[i] === undefined) return i;
                                      }
                                      return _(termSessions).size() + 1;
                                  })(termSessions) });
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

	io.sockets.on('connection', function(client){
		client.on('message', function(msgText){
            try {
			    var msg = JSON.parse(msgText);
            } catch(e) {
                console.error('ILLEGAL Message: ' + msgText);
                console.error(e);
                return;
            }

			switch(msg.method) {
            case "init":
				var id = msg.data.id;
				if(!(id in termSessions)){
					termSessions[id] = new TerminalSession(command, commandArgs, termSessions, msg.data);
				}
				termSessions[id].newClient(client);
                break;
            case 'log':
            case 'error':
            case 'warn':
                console[msg.method](msg.data);
                break;
            default:
				client.termSession.handleMessage(client, msg);
                break;
			}
		});
	
		client.on('disconnect', function(){
            if(!('termSession' in client)) { return; }
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
