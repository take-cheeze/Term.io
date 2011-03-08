
// "use strict"
var spawn = require('child_process').spawn;
var fs = require('fs');
var connect = require('connect');
var io = require('socket.io');

var port = parseInt(process.argv[2] || '8080', 10);
var sslKeyPath = 'privatekey.pem';
var sslCertPath = 'certificate.pem';
var useSSL = true;

var server;
if(useSSL){
	server = connect({
		key: fs.readFileSync(sslKeyPath),
		cert: fs.readFileSync(sslCertPath)
	});
} else {
	server = connect();
}

server.use(connect['static'](__dirname + '/static'));
var io = io.listen(server);

var ptys = {};
io.on('connection', function(client){
	client.initialized = false;
	client.on('message', function(data){
		//The first message sent by the client must be the term they want
		if(!client.initialized){
			var path = data;
			var term = spawn('python', ['-c', 'import pty;pty.spawn(["bash","-l"])']);
			// or spawn login or just "bash"
			//It might be better to link to the connections rather than storing a count
			ptys[path] = ptys[path] || {
				'term': term,
				'connections':0,
				'path':path
			};
			ptys[path].connections++;
			console.log('Connection open on <' + data + '> (' + ptys[path].connections + ' connected)');
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
		if(client.pty.connections === 0){
			client.pty.term.kill();
			delete ptys[client.pty.path];
		}
		console.log('Connection closed');
  });
});

server.listen(port);

process.on('uncaughtException', function(err) {
	console.log(err.stack);
});
