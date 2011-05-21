#!/usr/bin/env node
"use strict";

var child_process = require('child_process');
var fs = require('fs');
var os = require('os');
var tty = require('tty');

var connect = require('connect');
var io = require('socket.io');

require.paths.push(__dirname+"/static");
var _ = require('underscore-min.js');
var Term = require('term.js');
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
	if (req.url === '/') {
		res.writeHead(302, { 'Location': '/'+(_.size(termSessions) + 1) });
		res.end();
    } else {
		next();
	}
})
server.use(function(req, res, next){
    if (/^\/\w+$/.test(req.url)) {
        req.url = '/';
    }
    next();
});
server.use(connect['static'](__dirname + '/static'));


function TerminalSession(data){
	if ( this instanceof TerminalSession ) {
		this.clients = [];
		this.id = data.id;
		this.rows = data.rows;
		this.cols = data.cols;
		this.firstResizeDone = false;
		this.termProcess = child_process.spawn(command,commandArgs);
		this.term = new Term();
		this.term.debugOn = false;
		
		var self = this;
		this.termProcess.stdout.on('data', function(data) {
			self.sendMessage("broadcast","output",data.toString());
			self.term.write(data);
			if(! self.firstResizeDone ){
				self.resize("broadcast",{'rows':self.rows,'cols':self.cols});
				self.firstResizeDone = true;
			}
			
			process.stdout.write(data.toString());
			//console.log(self.term.getScreenAsText())
		});
		
	} else {
		return new TerminalSession(id);
	}
}

TerminalSession.prototype = {
	
	constructor: TerminalSession,
	
	newClient: function(client){
		this.clients.push(client);
		client.termSession = this;
		this.sendMessage(client,"init",this.term.getState());
	},
	
	clientDisconnect: function(client){
		this.clients = _(this.clients).without(client);
		if(this.clients.length === 0){
			process.nextTick(function() {
				client.termSession.termProcess.kill();
				delete termSessions[client.termSession.id];
			});
		}
	},
	
	input: function(client, data){
		this.termProcess.stdin.write(data);
	},
	
	send: function(client, data){
		this.termProcess.stdin.write(data);
	},
	
	resize: function(client, data){
		//return
		var self = this;
		var filearg = (os.type() === 'Linux')?'F':'f';
		var getTtyCmd = "ps -e -o ppid= -o tty= | awk '$1 == "+this.termProcess.pid+" {print $2}'";
		var sttyCmd = "stty -"+filearg+" /dev/";
		var rows = data.rows;
		var cols = data.cols;
		//var rows = tty.getWindowSize()[0];
		//var cols = tty.getWindowSize()[1]
		var ttyOptions = " rows "+rows+" columns "+cols;
		child_process.exec(getTtyCmd,function(error, tty){
			child_process.exec(sttyCmd+tty.trim()+ttyOptions,function(error){
				self.sendMessage(client,"ttyResizeDone",{'rows':rows,'cols':cols});
				self.term.resize(rows,cols);
			});
		});
	},
	
	sendMessage: function(client, method, data){
		if(client === "broadcast"){
			this.broadcast(method,data);
		} else {
			var msg = {"method":method, "data":data};
			client.send(JSON.stringify(msg));
		}
	},
	
	broadcast: function(method, data){		
		for(var clientNum in this.clients){
			this.sendMessage(this.clients[clientNum], method, data);
		}
	},
	
	handleMessage: function(client, msg){		
		if( !"method" in msg || !"data" in msg){
			return;
		}
		if(_(['input','resize','send']).contains(msg.method)){
			this[msg.method](client, msg.data);
		}		
	}
};


io.on('connection', function(client){
	
	client.on('message', function(msgText){
		var msg = JSON.parse(msgText);

		if(msg.method == "init"){
			var id = msg.data.id;
			if(!(id in termSessions)){
				termSessions[id] = new TerminalSession(msg.data);
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

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

console.log('Ready to accept connections at http'+(config.ssl.on?'s':'')+'://localhost:'+config.port);
