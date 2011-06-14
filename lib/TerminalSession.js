"use strict";
var tty = require('tty');
var child_process = require('child_process');
var os = require('os');

var _ = require('underscore');

var Term = require('term.js');

function TerminalSession(command, commandArgs, termSessions, data){
	if ( this instanceof TerminalSession ) {
		this.clients = [];
		this.id = data.id;
		this.rows = data.rows;
		this.cols = data.cols;
		this.firstResizeDone = false;
		this.termProcess = child_process.spawn(command,commandArgs);
		this.term = new Term();
		this.term.debugOn = false;
		this.termSessions = termSessions;
		
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
		return new TerminalSession(command, commandArgs, data);
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
				if(termSessions){
					delete this.termSessions[client.termSession.id];
				}
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
		var clientNum;
		for(clientNum in this.clients){
			this.sendMessage(this.clients[clientNum], method, data);
		}
	},
	
	handleMessage: function(client, msg){		
		if( !("method" in msg) || !("data" in msg)){
			return;
		}
		if(_(['input','resize','send']).contains(msg.method)){
			this[msg.method](client, msg.data);
		}		
	}
};

exports.TerminalSession = TerminalSession;