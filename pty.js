
"use strict";
var spawn = require('child_process').spawn;
var fs = require('fs');
var connect = require('connect');
var io = require('socket.io');
var noop = function(){};

var port = parseInt(process.argv[2] || '8080', 10);
var sslKeyPath = 'privatekey.pem';
var sslCertPath = 'certificate.pem';
var useSSL = false;
var command = 'python';
var commandArgs = ['-c', 'import pty;pty.spawn(["bash","-l"])'];

var server;
if(useSSL){
	server = connect({
		key: fs.readFileSync(sslKeyPath),
		cert: fs.readFileSync(sslCertPath)
	});
} else {
	server = connect();
}
server.listen(port);
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
			var path = data;
			var term;
			if(!ptys[path]){
				term = spawn(command,commandArgs);
				ptys[path] = ptys[path] || {
					'term': term,
					'connections':0,
					'path':path
				};
			}
			term = ptys[path].term;
			ptys[path].connections++;
			console.log('Connection open on ' + data + ' (' + ptys[path].connections + ' connected)');
			var pty = ptys[path];
			term.stdout.on('data', function(data) {
				client.send(data.toString());
			});
			
			term.on('exit', function() {
				// Close connection
			});
			
			client.initialized = true;
			client.pty = pty;
		}
		else{
			client.pty.term.stdin.write(data);
		}
	});
  client.on('disconnect', function(){
		client.pty.connections--;
		console.log('Connection closed on ' + client.pty.path + ' ('+client.pty.connections+' connected)');
		if(client.pty.connections === 0){
			client.pty.term.kill();
			delete ptys[client.pty.path];
		}
  });
});

console.log('Ready to accept connections at http'+(useSSL?'s':'')+'://localhost:'+port);
process.on('uncaughtException', function(err) {
	console.log(err.stack);
});
