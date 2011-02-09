var spawn = require('child_process').spawn;
var http = require('http');
var fs = require('fs');
var crypto = require('crypto');

var connect = require('connect');

function wsHandshake(request, head) {
	var md5 = crypto.createHash('md5');
	var k1 = request.headers['sec-websocket-key1'];
	var k2 = request.headers['sec-websocket-key2'];

	[k1, k2].forEach(function(k){
		var n = parseInt(k.replace(/[^\d]/g, ''));
		var spaces = k.replace(/[^ ]/g, '').length;

		if (spaces === 0 || n % spaces !== 0){
			return null;
		}
		n /= spaces;
		md5.update(String.fromCharCode(
			n >> 24 & 0xFF,
			n >> 16 & 0xFF,
			n >> 8  & 0xFF,
			n       & 0xFF));
	});
	md5.update(head.toString('binary'));
	return md5.digest('binary');	
};

var server = connect.createServer(
    connect.staticProvider(__dirname + '/static'),
	function(request, response) {
		fs.readFile('./terminal.html', function(err, buffer) {
			console.log('./terminal.html' + ': ' + buffer.length + ' bytes');
			response.writeHead(200, {
				'Content-Length': buffer.length,
				'Content-Type': 'text/html; charset=utf-8'
			});
			response.end(buffer);
		})
	}
);

var ptys = {};

server.on('upgrade', function(request, connection, head) {
	connection.setTimeout(0);
	connection.setNoDelay(true);

	var handshake = [
		'HTTP/1.1 101 Web Socket Protocol Handshake', 
		'Upgrade: WebSocket', 
		'Connection: Upgrade',
		'Sec-WebSocket-Origin: ' + request.headers.origin || 'null',
		'Sec-WebSocket-Location: ws://' + request.headers.host + request.url
	];
	var token = wsHandshake(request, head);

	if(token === null) {
		connection.destroy();
		return;
	}
	
	connection.write(handshake.join('\r\n') + '\r\n\r\n' + token, 'binary');
	
	var path = request.url;
	
	ptys[path] = ptys[path] || {
		term: spawn('python', ['-c', 'import pty;pty.spawn(["bash"])']),
		connections:0
	};
	
	ptys[path].connections++;
	console.log('Connection open on <' + request.url + '> (' + ptys[path].connections + ' connected)');
	
	var pty = ptys[path].term;	
	var closed = false;
	var wsOpen = true;

	pty.stdout.on('data', function(data) {
		if(!wsOpen) {
			return;
		}
		try {
			connection.write('\u0000', 'binary');
			connection.write(data);
			connection.write('\uffff', 'binary');			
		}
		catch(err) {}
	});
	pty.on('exit', function() {
		connection.end();
		delete ptys[path];
		closed = true;
	});
	connection.on('data', function(data) {
		var b = [];

		for(var i = 0; i < data.length; i++) {
			if(data[i] !== 0 && data[i] !== 255) {
				b.push(data[i]);
			}
		}
		if (!b.length) return;
		try {
			pty.stdin.write(new Buffer(b));
		}
		catch(err) {}
	});
	connection.on('close', function() {
		wsOpen = false;
		if(ptys[path]) {
			ptys[path].connections--; //just to to able to gc it using some fancy algorithm.			
		}
		console.log('Connection close ' + request.url);
//		if (!ptys[path].connections && !closed) {
//			pty.kill();
//		}
	});
});

server.listen(parseInt(process.argv[2] || '8080', 10));


process.on('uncaughtException', function(err) {
	console.log(err.stack);
});
