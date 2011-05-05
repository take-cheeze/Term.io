(function() {
	"use strict";
	
	var commonjs = typeof module !== 'undefined' && module.exports;
	var _ = commonjs ? require('underscore-min.js') : window._;
	
	function Term(){
		if ( this instanceof Term ) {
			this.grid = [];
			this.dirtyLines = {};
			this.cursor = { x: 0, y: 0, attr: 0x0088, visible: true };
			this.savedCursor = {};
			this.buffer = '';
			this.cols = 80;
			this.rows = 24;
			this.bell = function(){};
			this.scrollRegion = [1,24];
			this.redrawAll = false;
			this.alternateScreenBufferStart = 0;
			this.flags = {	appCursorKeys: false,
							specialScrollRegion: false,
							alternateScreenBuffer: false,
							insertMode: false,
							appKeypad: false};
		} else {
			return new Term();
		}
	}
	
	//Escape sequence regular expressions
	var rESC = /^\u001B([()#][0-9A-Za-z]|[0-9A-Za-z<>=])/,
	rCSI = /^(?:\u001B\[|\u009B)([ -?]*)([@-~])/,
	rOSC = /^\u001B\](.*)(?:\u0007|\u001B\\)/;
		
	Term.prototype = {
		
		constructor: Term,
		
		getScreenAsText: function() {
			var screen = "";
			var firstLine = this.windowFirstLine();
			var numLines = this.windowFirstLine() + this.rows;
			for(var i = firstLine; i < numLines; i++){
				screen += this.renderLineAsText(i) + '\r\n';
			}
			return screen;
		},
		
		renderLineAsText: function(lineNo) {
			if (lineNo >= this.grid.length) {
				return '';
			}
			var line = this.grid[lineNo];
			var lineLength = line.length;
			if (lineNo === this.cursor.y && this.cursor.x + 1 > lineLength) {
				lineLength = this.cursor.x + 1;
			}
			var text = '';
			for (var i = 0; i < lineLength; i++) {
				if( typeof(line[i]) == 'undefined'){
					text += ' ';
				} else {
					text += line[i][1];
				}
			}
			return text;
		},
		
		ensureLineExists: function(lineNo) {
			while (this.grid.length <= lineNo) {
				this.dirtyLines[this.grid.length] = true;
				this.grid.push([]);
			}
		},
		
		ensureColumnExists: function(position) {
			var line = this.grid[position.y];
			while (line.length < position.x) {
				line.push([this.cursor.attr, ' ']);
			}
		},
		
		windowFirstLine: function() {
			return Math.max(0, this.grid.length - this.rows);
		},
		
		// Takes a screen line number and returns the line number in the array
		// Accounts for scroll history
		// Line Coords are 0 indexed, Screen Coords are 1 indexed
		toLineCoords: function(line) {
			return line - 1 + this.windowFirstLine();
		},
		
		toScreenCoords: function(line) {
			return line + 1 - this.windowFirstLine();
		},
		
		emptyLineArray: function(maxSize) {
			maxSize = maxSize || this.cols;
			
			var array = [[this.cursor.attr, ' ']];
			for (var i = 0; i < 9; i++) {
				array = array.concat(array);
			}
			return array.slice(0, maxSize);
		},
		
		blankLines: function(lines) {
			var blanks = [];
			for(var i = 0; i < lines; i++){
				blanks.push([]);
			}
			return blanks;
		},
		
		replaceInArray: function(array, index, replacement) {
			return array.slice(0, index).concat(replacement,array.slice(index + replacement.length));
		},
		
		replaceChar: function(position, ach) {
			this.ensureLineExists(position.y);
			this.grid[position.y] = this.replaceInArray(this.grid[position.y], position.x, [ach]);
			this.dirtyLines[position.y] = true;
		},
		
		insertChar: function(position, ach) {
			this.ensureLineExists(position.y);
			var line = this.grid[position.y];
			this.grid[position.y] = line.slice(0, position.x).concat([ach],line.slice(position.x));
			this.dirtyLines[position.y] = true;
		},
		
		setCursor: function(newPosition) {
			var newYScreenCoords = newPosition.y - this.windowFirstLine() + 1;
			if(this.flags.specialScrollRegion && this.scrollRegion[1] < newYScreenCoords){			
				this.deleteLines(1);
			} else if(this.flags.specialScrollRegion && this.scrollRegion[0] > newYScreenCoords){
				console.warn("specialScrollRegion: Not Implemented "+this.scrollRegion+newYScreenCoords);
			} else {
				this.dirtyLines[this.cursor.y] = true;
				if (newPosition.x !== undefined) {
					this.cursor.x = (newPosition.x < 0) ? 0 : newPosition.x;
				}
				if (newPosition.y !== undefined) {
					this.cursor.y = (newPosition.y < 0) ? 0 : newPosition.y;
				}
			}
			
			this.ensureLineExists(this.cursor.y);
			if(this.cursor.x > this.cols){
				this.cursor.x = 0;
				this.cursor.y++;
			}
			this.dirtyLines[this.cursor.y] = true;
			this.ensureLineExists(this.cursor.y);
			this.ensureColumnExists(this.cursor);
		},
		
		moveCursor: function(direction) {
			this.setCursor({
				x: this.cursor.x + (direction.x || 0),
				y: this.cursor.y + (direction.y || 0)
			});
		},
		
		enterChar: function(ch) {
			if(this.flags.insertMode === false){
				this.replaceChar(this.cursor, [this.cursor.attr, ch]);
			} else {
				this.insertChar(this.cursor, [this.cursor.attr, ch]);
			}
			this.moveCursor({ x: 1 });
		},
		
		nextTabStop: function() {
			var position = this.cursor.x;
			position = (position | 7) + 1; // 8 characters tab stop
			this.setCursor({ x: position });
			// TODO: Use dynamic tab stops and recognize CSI * g and ESC H.
		},
		
		reset: function() {
			this.grid = [];
			this.dirtyLines = {};
			this.cursor = { x: 0, y: 0, attr: 0x0088, visible: true };
			_(this.flags).each(function(val,key){
				this.flags[key] = false;
			});
		},
		
		deleteLines: function(num) {
			// This may only work for the way vim uses delete
			var scrollTop = this.toLineCoords(this.scrollRegion[0]);
			var scrollBotton = this.toLineCoords(this.scrollRegion[1]);
			var blanks = this.blankLines(num);
			var g = this.grid;
			this.grid = g.slice(0,scrollTop).concat(g.slice(scrollTop + num, scrollBotton + 1),blanks,g.slice(scrollBotton + 1));
			for (var y = scrollTop; y <= scrollBotton; y++) {
				this.dirtyLines[y] = true;
			}
		},
		
		insertLines: function(num) {
			var scrollTop = this.toLineCoords(this.scrollRegion[0]);
			var scrollBotton = this.toLineCoords(this.scrollRegion[1]);
			var blanks = this.blankLines(num);
			var g = this.grid;
			this.grid = g.slice(0,scrollTop).concat(blanks,g.slice(scrollTop,scrollBotton),g.slice(scrollBotton + 1));
			for (var line = scrollTop; line <= scrollBotton; line++) {
				this.dirtyLines[line] = true;
			}
		},
		
		saveCursor: function() {
			this.savedCursor = _.clone(this.cursor);
			this.savedCursor.y = this.toScreenCoords(this.savedCursor.y);
		},
		
		restoreCursor: function() {
			this.savedCursor.y = this.toLineCoords(this.savedCursor.y);
			this.cursor = this.savedCursor;
			this.savedCursor = {};
		},
		
		alternateScreenBuffer: function() {
			this.flags.alternateScreenBuffer = true;
			this.alternateScreenBufferStart = this.grid.length;
		},
		
		normalScreenBuffer: function() {
			this.flags.alternateScreenBuffer = false;
			this.grid = this.grid.slice(0,this.alternateScreenBufferStart);
			this.grid[this.alternateScreenBufferStart - 1] = [];
			this.redrawAll = true;
		},
		
		parseArg: function(arg, defaultVal){
			return parseInt(arg || defaultVal, 10) || defaultVal;
		},
		
		escapeCodeESC: function(command) {
			if (command === 'M') {
				// This only works for the way less uses it
				this.insertLines(1);
			} else if (command === 'c') {
				this.reset();
			} else if (command === '(B') {
				this.cursor.attr &= ~0x300; // <-- HACK SO `top` WORKS PROPERLY
			} else if (command === '7') {	// Save Cursor
				this.saveCursor();
			} else if (command === '8') {	// Restore Cursor
				this.restoreCursor();
			} else if(command === '=') {
				this.flags.appKeypad = true;
				console.warn("Application keypad: not implemented");
			} else if(command === '>') {
				this.flags.appKeypad = false;
			} else {
				console.warn('Unhandled escape code ESC ' + command);
			}
		},
		
		escapeCodeCSI: function(args, command) {
			args = args ? args.split(';') : [];
			var arg = this.parseArg(args[0],0);
			var line;
			if (command >= 'A' && command <= 'D') { //Arrow Keys
				arg = this.parseArg(args[0],1);
				var directions = {
					'A': { y: -arg },
					'B': { y:  arg },
					'C': { x:  arg },
					'D': { x: -arg }
				};
				this.moveCursor(directions[command]);
			} else if (command === 'G') { //Move cursor to col n
				this.setCursor({ x: arg });
			} else if (command === 'H' || command === 'f') { //Move cursor to pos x,y
				var newY = this.parseArg(args[0],1);
				var newX = this.parseArg(args[1],1) - 1;
				this.setCursor({ x: newX, y: this.toLineCoords(newY)});
			} else if (command === 'J') { //Clear screen
				var firstLine  = this.windowFirstLine();
				var lastLine   = Math.min(firstLine + this.rows, this.grid.length) - 1;
				var cursorLine = this.cursor.y;
				if (arg === 1) {
					lastLine  = firstLine + this.rows - 1;
					firstLine = cursorLine;
				} else if (arg !== 2) {
					lastLine = cursorLine;
				} else {
					firstLine = lastLine;
					lastLine  = firstLine + this.rows - 1;
					this.setCursor({ y: firstLine });
				}
				var emptyLine = this.emptyLineArray(this.cols);
				for (var y = firstLine; y <= lastLine; y++) {
					this.grid[y] = emptyLine.slice(0);
					this.dirtyLines[y] = true;
				}
			} else if (command === 'K') { //Clear line
				line = this.grid[this.cursor.y];
				if (arg === 1) {
					this.grid[this.cursor.y] = this.emptyLineArray(this.cursor.x + 1).concat(line.slice(this.cursor.x + 1));
				} else if (arg === 2) {
					this.grid[this.cursor.y] = [];
				} else {
					if (arg !== 0) {
						console.warn('Unknown argument for CSI "K": ' + arg);
					}
					this.grid[this.cursor.y] = line.slice(0, this.cursor.x);
				}
				this.dirtyLines[this.cursor.y] = true;
			} else if (command === 'M') { //Delete line
				this.deleteLines(this.parseArg(args[0],1));
			} else if (command === 'L') { //Insert line
				this.insertLines(this.parseArg(args[0],1));
			} else if (command === 'P') { //Delete
				arg = this.parseArg(args[0],1);
				if (arg > 0) {
					line = this.grid[this.cursor.y];
					this.grid[this.cursor.y] = line.slice(0, this.cursor.x).concat(line.slice(this.cursor.x + arg));
					this.dirtyLines[this.cursor.y] = true;
				}
			} else if (command === 'c'){ //Send device attributes
				// Silently fail to send attributes
				// will implement if they need to be sent for some reason
				if(args[0] === '>'){
					//\u001B[1;4.8.0;0c  //vt100
				}
			} else if (command === 'h') { //Set Mode
				arg = args[0];
				if(arg === '4'){ //Insert mode
					this.flags.insertMode = true;
				} else if(arg === '?1'){ //App Cursor Keys
					this.flags.appCursorKeys = true;
				} else if (arg === '?25') { //Cursor Visible
					this.cursor.visible = true;
				} else if(arg === '?47'){	//Alternate screen buffer
					this.alternateScreenBuffer();
				} else if(arg === '?1049'){ //Alternate screen buffer and save cursor
					this.alternateScreenBuffer();
					this.saveCursor();
				} else {
					console.warn('Unknown argument for CSI "h": ' + JSON.stringify(arg));
				}
			} else if (command === 'l') { //Reset Mode
				arg = args[0];
				if(arg === '4'){ //Replace Mode
					this.flags.insertMode = false;
				} else if(arg === '?1'){ //Normal Cursor Keys
					this.flags.appCursorKeys = false;
				} else if (arg === '?25') { //Cursor invisible
					this.cursor.visible = false;
				} else if (arg === '?47'){ //Normal Screen buffer
					this.normalScreenBuffer();
				} else if (arg === '?1049'){ // Normal Screen buffer and restore cursor
					this.normalScreenBuffer();
					this.restoreCursor();
				} else {
					console.warn('Unknown argument for CSI "l": ' + JSON.stringify(arg));
				}
			} else if (command === 'm') { //Set Graphics
				if(args.length === 0){
					args = [0];
				}
				for (var i = 0; i < args.length; i++) {
					arg = this.parseArg(args[i],0);
					// Bits
					// 0-3	Text color
					// 4-7	Bg color
					// 8	Bold
					// 9	Image Negative
					// 10	Underline
					if (arg === 0) { //Default
						this.cursor.attr = 0x0088;
					} else if (arg === 1) { //Bold
						this.cursor.attr |= 0x0100;
					} else if (arg === 2) { //Bold off
						this.cursor.attr &= ~0x0100;
					} else if (arg === 4) { //Underline
						this.cursor.attr |= 0x0400;
					} else if (arg === 7) { //Image negative
						this.cursor.attr |= 0x0200;
					} else if (arg === 22) { //Normal (not bold or faint)
						this.cursor.attr &= ~0x0100;
					} else if (arg === 24) { //Underline off
						this.cursor.attr &= ~0x0400;
					} else if (arg === 27) { //Image negative off
						this.cursor.attr &= ~0x0200;
					} else if (arg >= 30 && arg <= 37) { //Text Color
						this.cursor.attr &= ~0x000F;
						this.cursor.attr |= arg - 30;
					} else if (arg === 39) { //Default Text Color
						this.cursor.attr &= ~0x000F;
						this.cursor.attr |= 8;
					} else if (arg >= 40 && arg <= 47) { //Bg Color
						this.cursor.attr &= ~0x00F0;
						this.cursor.attr |= (arg - 40) << 4;
					} else if (arg === 49) { //Default Bg Color
						this.cursor.attr &= ~0x00F0;
						this.cursor.attr |= 8 << 4;
					} else {
						console.warn('Unhandled escape code CSI argument for "m": ' + arg);
					}
				}
			} else if (command === 'r'){ //Set scrolling region (vi)
				var topRow = this.parseArg(args[0],0);
				var botRow = this.parseArg(args[1],0);
				if(topRow === 1 && botRow == this.rows){
					this.flags.specialScrollRegion = false;
				} else {
					this.flags.specialScrollRegion = true;
					this.scrollRegion = [topRow,botRow];
				}
			} else {
				console.warn('Unhandled escape code CSI ' + command + ' ' + JSON.stringify(args));
			}
		},
		
		escapeCodeOSC: function(command) {
			if (command.substr(0, 2) === '0;') {
				// document.title = command.substr(2);
			} else {
				console.warn('Unhandled escape code OSC ' + JSON.stringify(command));
			}
		},
		
		debugLog: function(text){
			var esc = String.fromCharCode(9243);
			var line = text.replace(/\u001b/g,esc);
			line = JSON.stringify(line);
			console.log(line);
		},
		
		parseBuffer: function() {
			//this.debugLog(this.buffer);
			var currentLength = 0;
			var matches;
			while (currentLength !== this.buffer.length && this.buffer.length > 0) {
				currentLength = this.buffer.length;
				var ch = this.buffer.substr(0, 1);
				if (ch === '\u001B' || ch === '\u009B') {
					matches = this.buffer.match(rESC);
					if (matches) {
						this.buffer = this.buffer.substr(matches[0].length);
						this.escapeCodeESC.apply(this, matches.slice(1));
						continue;
					}
					matches = this.buffer.match(rCSI);
					if (matches) {
						this.buffer = this.buffer.substr(matches[0].length);
						this.escapeCodeCSI.apply(this, matches.slice(1));
						continue;
					}
					matches = this.buffer.match(rOSC);
					if (matches) {
						this.buffer = this.buffer.substr(matches[0].length);
						this.escapeCodeOSC.apply(this, matches.slice(1));
						continue;
					}
					//TODO make it so esc esc or something like that wouldn't break term
					console.warn('Unhandled escape codes ' + JSON.stringify(this.buffer));
				} else {
					this.buffer = this.buffer.substr(1);
					if (ch === '\u0007') {
						this.bell();
					} else if (ch === '\b') {
						this.moveCursor({ x: -1 });
					} else if (ch === '\t') {
						this.nextTabStop();
					} else if (ch === '\r') {
						this.setCursor({ x: 0 });
					} else if (ch === '\n') {
						this.moveCursor({ y: 1 });
					} else if (ch >= ' ') {
						this.enterChar(ch);
					} else {
						console.error('Unhandled character ' + JSON.stringify(ch));
					}
				}
			}
		},
		
		resize: function(rows,cols){
			var oldRows = this.rows;
			this.rows = rows;
			this.cols = cols;
			if(_(this.scrollRegion).isEqual([1,oldRows])){
				this.scrollRegion = [1,this.rows];
			}
		},
		
		write: function(data) {
			this.buffer += data;
			this.parseBuffer();
		}
	};
		
	if (typeof module !== 'undefined' && module.exports) {
	    module.exports = Term;
	} else {
	    window.Term = Term;
	}
	
})();