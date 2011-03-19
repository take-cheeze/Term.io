
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


var ptys = {};
io.on('connection', function(client){
	client.initialized = false;
	client.on('message', function(data){
		//The first message sent by the client must be the term they want
		if(!client.initialized){
			var id = data;
			var termProcess;
			if(!ptys[id]){
				termProcess = spawn(command,commandArgs);
				ptys[id] = ptys[id] || {
					'termProcess': termProcess,
					'connections':0,
					'id':id,
					'term': new Term()
				};
			}
			termProcess = ptys[id].termProcess;
			ptys[id].connections++;
			console.log('Connection open on ' + data + ' (' + ptys[id].connections + ' connected)');
			var pty = ptys[id];
			termProcess.stdout.on('data', function(data) {
				client.send(data.toString());
				pty.term.write(data);
				//console.log(pty.term.getScreenAsText())
			});
			
			termProcess.on('exit', function() {
				// Close connection
			});
			
			client.initialized = true;
			client.pty = pty;
		}
		else{
			client.pty.termProcess.stdin.write(data);
		}
	});
  client.on('disconnect', function(){
		client.pty.connections--;
		console.log('Connection closed on ' + client.pty.id + ' ('+client.pty.connections+' connected)');
		if(client.pty.connections === 0){
			client.pty.termProcess.kill();
			delete ptys[client.pty.id];
		}
  });
});

console.log('Ready to accept connections at http'+(config.ssl.on?'s':'')+'://localhost:'+config.port);
process.on('uncaughtException', function(err) {
	console.log(err.stack);
});
