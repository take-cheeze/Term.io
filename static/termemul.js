(function() {
	"use strict";
	
	function term(){
		if ( this instanceof term ) {
			var noop = function() {};
			this.grid = [];
			this.dirtyLines = {};
			this.cursor = { x: 0, y: 0, attr: 0x0088, visible: true };
			this.buffer = '';
			this.onreset = noop;
			this.columns = 80;
			this.rows = 24;
			this.bell = noop;
			this.scrollRegion = [0,0];
			this.flags = {	appCursorKeys: false,
						specialScrollRegion: false};
		} else {
			return new term();
		}
	}
	
	//Escape sequence regular expressions
	var rESC = /^\u001B([()#][0-9A-Za-z]|[0-9A-Za-z<>=])/,
	rCSI = /^(?:\u001B\[|\u009B)([ -?]*)([@-~])/,
	rOSC = /^\u001B\](.*)(?:\u0007|\u001B\\)/;
		
	term.prototype = {
		
		constructor: term,
		
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
				text += line[i][1] | ' ';
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
			this.dirtyLines[position.y] = true;
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
			return this.windowFirstLine() + line - 1;
		},
		
		emptyLineArray: function(maxSize) {
			maxSize = maxSize || 80;
			
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
			if(this.cursor.x > this.columns){
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
			this.replaceChar(this.cursor, [this.cursor.attr, ch]);
			this.moveCursor({ x: 1 });
		},
		
		nextTabStop: function() {
			var position = this.cursor.x;
			position = (position | 7) + 1; // 8 characters tab stop
			this.setCursor({ x: position });
			// TODO: Use dynamic tab stops and recognize CSI * g and ESC H.
		},
		
		reset: function() {
			this.onreset();
			this.grid = [];
			this.dirtyLines = {};
			this.cursor.x = 0;
			this.cursor.y = 0;
			this.cursor.attr = 0x0088;
			this.cursor.visible = true;
			this.flags.appCursorKeys = false;
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
		
		parseArg: function(arg, defaultVal){
			return parseInt(arg || defaultVal, 10) || defaultVal;
		},
		
		escapeCodeESC: function(command) {
			if (command === 'c') {
				this.reset();
			} else if (command === '(B') {
				this.cursor.attr &= ~0x300; // <-- HACK SO `top` WORKS PROPERLY
			} else if (command === '7' || command === '8'){
				console.warn("Save/Restore cursor: not implemented"); 
			} else if(command === '=' || command === '>'){ // used in less, vi, reset
				console.warn("Application keypad on/off: not implemented");
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
				var newY = this.parseArg(args[0],1) - 1;
				var newX = this.parseArg(args[1],1) - 1;
				this.setCursor({ x: newX, y: newY + this.windowFirstLine() });
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
				var emptyLine = this.emptyLineArray(this.columns);
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
				arg = this.parseArg(args[0],1);
				var scrollTop = this.toLineCoords(this.scrollRegion[0]);
				var scrollBotton = this.toLineCoords(this.scrollRegion[1]);
				var blanks = this.blankLines(arg);
				var g = this.grid;
				this.grid = g.slice(0,scrollTop).concat(blanks,g.slice(scrollTop,scrollBotton),g.slice(scrollBotton + 1));
				for (var y = scrollTop; y <= scrollBotton; y++) {
					this.dirtyLines[y] = true;
				}
			} else if (command === 'P') { //Delete
				arg = this.parseArg(args[0],1);
				if (arg > 0) {
					line = this.grid[this.cursor.y];
					this.grid[this.cursor.y] = line.slice(0, this.cursor.x).concat(line.slice(this.cursor.x + arg));
					this.dirtyLines[this.cursor.y] = true;
				}
			} else if (command === 'c'){ //Send device attributes
				if(args[0] === '>'){
					//\u001B[1;4.8.0;0c  //vt100
				}
				console.warn('Send device attributes: not implemented ('+JSON.stringify(args)+')'); //used by vi
			} else if (command === 'h') { //Set Mode
				arg = args[0];
				if(arg === '4'){ //Insert mode ()
					console.warn('Insert Mode: not implemented');//bash: type "xy " then type over x or y
				}
				if(arg === '?1'){ //App Cursor Keys
					this.flags.appCursorKeys = true;
				}
				else if (arg === '?25') { //Cursor Visible
					this.cursor.visible = true;
				} 
				else if(arg === '?47'){	//Alternate screen buffer
					console.warn('Alternate screen buffer: not implemented');//vi, man, less
				}
				else {
					console.warn('Unknown argument for CSI "h": ' + JSON.stringify(arg));
				}
			} else if (command === 'l') { //Reset Mode
				arg = args[0];
				if(arg === '4'){ //Replace Mode
					console.warn('Replace Mode: always on');
				}
				if(arg === '?1'){ //Normal Cursor Keys
					this.flags.appCursorKeys = false;
				} else if (arg === '?25') { //Cursor invisible
					this.cursor.visible = false;
				} else if (arg === '?47'){ //Normal Screen buffer
					console.warn('Alternate screen buffer: not implemented');
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
				if(topRow === 0 && botRow == this.rows){
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
				document.title = command.substr(2);
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
			if (this.buffer.length > 0) {
				console.warn('Unparsed buffer ' + JSON.stringify(this.buffer));
			}
		},
		
		write: function(data) {
			this.buffer += data;
			this.parseBuffer();
		}
	};
		
	var debounce = function (func, minwait, maxwait, context) {
	    var timeout;
		var lasttime;
	    return function(){
	        var args = arguments;
			var now = (new Date()).getTime();
			var interval = lasttime ? now - lasttime : 0;
			var nextWait = Math.min(Math.max(minwait,interval*2),maxwait);
			
			function execute() {
		        func.apply(context, args);
		        timeout = null; 
		    }
	        clearTimeout(timeout);
	        timeout = setTimeout(execute, nextWait); 
			lasttime = now;
	    };
	};

	// Constants
	var INPUT = 1, OUTPUT = 0;

	function Terminal(element){
		if ( this instanceof Terminal ) {
			var lowLevelTerm = term();
			
			this.cursorId = 'cursor';
			this.term = lowLevelTerm;
			this.terminalElement = element;
			this._stdin = $.noop;
			this.cursorBlinkId = undefined;
			this._colors = null;
			this.stylesheetId = 'terminal-css';
			this._lastScrollTop = null;
			this._lastScrollSnap = null;
			this._cachedNumberOfLines = null;
			this._cachedCharacterWidth = null;
			this._cachedCharacterHeight = null;
			this.lastWrite = 0;
			this._lastMessageType = INPUT;
			this.themes = {
				'Tango': [
					'#000000', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
					'#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
					'#ffffff', '#1a1a1a' ],
				'Linux Terminal': [
					'#000', '#a00', '#0a0', '#a50', '#00a', '#a0a', '#0aa', '#aaa',
					'#555', '#f55', '#5f5', '#ff5', '#55f', '#f5f', '#5ff', '#fff',
					'#000', '#fff' ],
				'Standard VGA': [
					'#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
					'#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
					'#ffffff', '#1a1a1a'],
				'cmd.exe': [
					'#000000', '#800000', '#080000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0', 
					'#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
					'#ffffff', '#1a1a1a'],
				'Terminal.app': [
					'#000000', '#c23621', '#25bc24', '#adad27', '#492ee1', '#d338d3', '#33bbc8', '#cbcccd', 
					'#818383', '#fc391f', '#25bc24', '#eaec23', '#5833ff', '#f935f8', '#14f0f0', '#e9ebeb',
					'#ffffff', '#1a1a1a'],
				'PuTTY': [
					'#000000', '#bb0000', '#00bb00', '#bbbb00', '#0000bb', '#bb00bb', '#00bbbb', '#bbbbbb', 
					'#555555', '#ff5555', '#31e722', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
					'#ffffff', '#1a1a1a'],
				'xterm': [
					'#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5', 
					'#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
					'#ffffff', '#1a1a1a']	
			};
			
			this.term.bell = function() {
				document.getElementById('beep').play(3);
			};
			this.term.onreset = this.softReset;
			
			$(window).bind('keydown',function(e){TermJS.onKeydown(e);});
			$(window).bind('keypress',function(e){TermJS.onKeypress(e);});
			$(window).bind('resize',function(e){TermJS.onResize(e);});
			$(window).bind('paste',function(e){TermJS.onPaste(e);});
			
			this.softReset();
			this.enableScrollSnapping();
			
		} else {
			return new Terminal(element);
		}
	}

	
	Terminal.prototype = {
		
		setStdin: function(fn) {
			this._stdin = fn;
		},
		
		softReset: function() {
			$(this.terminalElement).html('<div class="a0088"></div>');
			this.invalidateCachedNumberOfLines();
		},
		
		input: function(data){
			TermJS._lastMessageType = INPUT;
			TermJS._stdin(data);
		},
		
		onKeydown: function(e) {
			var shift = e.shiftKey;
			var ctrl  = e.ctrlKey;
			var meta  = e.altKey;
			var mods   = shift || ctrl || meta;
			var onlyCtrl  = ctrl  && !(shift || meta);
			var ctrlShift = ctrl  && shift && !meta;
			//console.log('keydown... ' + e.which, shift, ctrl, meta);
			var SS3Seq = '\u001BO';
			var CSISeq = '\u001B[';
			var arrowSeq = this.term.flags.appCursorKeys ? SS3Seq : CSISeq;
			if (!mods && (e.which === 8 || e.which === 9 || e.which === 27)) { //backspace tab esc
				var ch = String.fromCharCode(e.which);
				TermJS.input(ch);
			} else if (!mods && e.which === 37) { // Left arrow
				TermJS.input(arrowSeq+'D');
			} else if (!mods && e.which === 38) { // Up arrow
				TermJS.input(arrowSeq+'A');
			} else if (!mods && e.which === 39) { // Right arrow
				TermJS.input(arrowSeq+'C');
			} else if (!mods && e.which === 40) { // Down arrow
				TermJS.input(arrowSeq+'B');
			} else if (onlyCtrl && e.which >= 65 && e.which <= 90) { // make Ctrl + A-Z work for lowercase
				TermJS.input(String.fromCharCode(e.which - 64));
			} else if (ctrlShift && e.which === 84) { // Ctrl Shift t to open  new tab
				window.open(location.href);
			} else if (ctrlShift && e.which === 87) { // Ctrl Shift w to close tab
				window.close();
			} else {
				//console.log('Unhandled keydown ' + e.which);
				return;
			}
			// event was handled
			e.preventDefault();
			return false;
		},
		
		onKeypress: function(e) {
			//console.log('keypress... ' + e.which);
			var ch = String.fromCharCode(e.which);
			TermJS.input(ch);
			e.preventDefault();
			return false;
		},
		
		onResize: function(e) {
			//TODO: update tty size with stty on host
			TermJS.scrollToBottom();
			return false;
		},
		
		onPaste: function(e){
			e.stopPropagation();
			e.preventDefault();
			var data = e.originalEvent.clipboardData.getData('text/plain');
			TermJS.input(data);
		},

		applyTheme: function(css) {
			if (!document.getElementById(this.stylesheetId)) {
				$('<style type="text/css" id="' + this.stylesheetId + '">' + css + '</style>').appendTo($('head'));
			} else {
				$('#' + this.stylesheetId).html(css);
			}
		},

		theme: function(newColors) {
			if (newColors === undefined) {
				return this._colors.slice(0);
			} else {
				this._colors = newColors.slice(0);
				this.applyTheme(this.compileThemeToCss());
			}
		},
		
		attributeToCss: function(attr, selected) {
			if (selected) {
				attr = (attr ^ 0x200) & ~0x100;
			}
			var bright  = attr & 0x100;
			var inverse = attr & 0x200;
			var bgIndex = (attr >> 4) & 0xF;
			var fgIndex =  attr       & 0xF;
			if (bgIndex >= 8) { bgIndex = 16; }
			if (fgIndex >= 8) { fgIndex = 17; }
			if (inverse) {
				var swap = bgIndex;
				bgIndex  = fgIndex;
				fgIndex  = swap;
			}
			if (fgIndex < 8 && bright) { fgIndex |= 8; }
			return 'color: ' + this._colors[fgIndex] + ';' +
				(bgIndex !== 16 || inverse || selected ? ' background: ' + this._colors[bgIndex] + ';' : '') +
				(bright ? ' font-weight: bold;' : '');
		},

		compileThemeToCss: function() {
			var css = '\r\n';
			for (var misc = 0; misc <= 3; misc++) {
				for (var bg = 0; bg <= 8; bg++) {
					for (var fg = 0; fg <= 8; fg++) {
						var attr = misc << 8 | bg << 4 | fg;
						var classSel = '.' + this.attrToClass(attr);
						css += classSel + ' { ' + this.attributeToCss(attr) + ' }\r\n';
						css += classSel + '::selection { ' + this.attributeToCss(attr, true) + ' }\r\n';
					}
				}
			}
			return css;
		},

		attrToClass: function(attr) {
			return 'a' + ('0000' + (attr & 0x3FF).toString(16)).substr(-4).toUpperCase();
		},

		attrFromClass: function(className) {
			if (className) {
				return parseInt(className.substr(1), 16);
			} else {
				return 0x0088;
			}
		},

		renderLineAsHtml: function(lineNo, $div) {
			var cursor = this.term.cursor;
			var grid = this.term.grid;
			if (lineNo >= grid.length) {
				return '';
			}
			var line = grid[lineNo];
			var lineLength = line.length;
			if (lineNo === cursor.y && cursor.x + 1 > lineLength) {
				lineLength = cursor.x + 1;
			}

			var spanOpen = false;
			var lastStyle = null;
			var text = "";
			for (var i = 0; i < lineLength; i++) {
				var ach = line[i] || [cursor.attr, ' '];
				var a  = ach[0];
				var ch = ach[1];
				var isCursor = (lineNo === cursor.y && i === cursor.x && cursor.visible);
				if (isCursor) {
					a ^= 0x200;
				}
				var cursorId = (isCursor ? ' id="' + this.cursorId + '"' : '');
				var style = (a & 0x400 ? ' style="text-decoration: underline;"' : '');

				if(a == lastStyle){
					text += ch;
				} else {
					if(spanOpen){
						spanOpen = false;
						$div.find('span:last').text(text);
						text = '';
					}
					if(a == 0x88 && !isCursor){
						text += ch;
					} else {
						if(text.length > 0){
							$div.append(document.createTextNode(text));
							text = "";
						}
						$div.append('<span class="' + this.attrToClass(a) + '"' + cursorId + style + '>');
						text += ch;
						spanOpen = true;
					}
				}
				lastStyle = a;	
			}
			if(text.length > 0){
				if(spanOpen){
					$div.find('span:last').text(text);
				} else {
					$div.append(document.createTextNode(text));
				}
			}
		},

		renderEachDirtyLine: function(iterator) {
			var linesToRender = [];
			for (var key in this.term.dirtyLines) {
				if(key >= 0){
					linesToRender.push(parseInt(key,10));
				}
			}
			linesToRender.sort(function(a,b){ return (a-b);});
			for (var i = 0; i < linesToRender.length; i++) {
				var lineNo = linesToRender[i];
				var missingLines = lineNo - this.numberOfLines() + 1;
				if (missingLines > 1) {
					console.error("Missing Lines: should this happen?");
					var html = '';
					for (var j = 0; j < missingLines; j++) {
						html += '<div></div>';
					}
					$(this.terminalElement).append(html);
				}
				var $div = $("<div>");
				if (missingLines == 1){
					this.renderLineAsHtml(lineNo,$div);
					$(this.terminalElement).append($div);
				} else {					
					$div = $(this.terminalElement).children().eq(lineNo);
					$div.empty();
					this.renderLineAsHtml(lineNo,$div);
				}
				this.invalidateCachedNumberOfLines();
			}
			this.term.dirtyLines = {}; // Reset list of dirty lines after rendering
		},
		
		scrollSnap: function() {
			var characterHeight = this.characterHeight();
			var position = $(window).scrollTop();
			var snapPosition = Math.floor(position / characterHeight) * characterHeight;
			if (snapPosition !== this._lastScrollSnap) {
				$(window).scrollTop(snapPosition);
				this._lastScrollSnap = snapPosition;
			}
			return false;
		},

		enableScrollSnapping: function() {
			var debouncedScrollSnap = debounce(this.scrollSnap,150, 300, this);
			$(window).scroll(function(){debouncedScrollSnap();});
			$(window).resize(function(){debouncedScrollSnap();});
		},

		scrollToBottom: function() {
			// if there is output that is not a direct response to input and we are scrolling up,
			// don't scroll down on output
			if(this._lastMessageType == OUTPUT && $(window).scrollTop() != this._lastScrollTop){
				return;
			}
			var firstLine = this.numberOfLines() - this.term.rows;
			if (firstLine < 0) {
				firstLine = 0;
			}
			var position = firstLine * this.characterHeight();
			if (position !== this._lastScrollTop) {
				// Make room to scroll
				$('html').height(position + $(window).height());
				$(window).scrollTop(position);
				this._lastScrollTop = position;
			}
			return;
		},

		startCursorBlinking: function() {
			this.stopCursorBlinking();
			var cursor = $('#' + this.cursorId);
			var cursorClass = cursor.attr('class');
			var invClass = this.attrToClass(this.attrFromClass(cursorClass) ^ 0x200);
			this.cursorBlinkId = window.setInterval(function() {
				if(cursor.attr('class') == cursorClass){
					cursor.removeClass().addClass(invClass);
				} else {
					cursor.removeClass().addClass(cursorClass);
				}
			}, 500);
		},

		stopCursorBlinking: function() {
			window.clearInterval(this.cursorBlinkId);
			this.cursorBlinkId = undefined;
		},

		numberOfLines: function() {
			if (!this._cachedNumberOfLines) {
				var b = $(this.terminalElement).find('> div');
				this._cachedNumberOfLines = b.size();
				if(this._cachedNumberOfLines == 2){
					b = $(this.terminalElement).find('> div');					
					window.a = b;
				}
			}
			return this._cachedNumberOfLines;
		},

		invalidateCachedNumberOfLines: function() {
			this._cachedNumberOfLines = null;
			return false;
		},

		characterWidth: function() {
			if (!this._cachedCharacterWidth) {
				this._cachedCharacterWidth = $('#'+this.cursorId).innerWidth();
			}
			return this._cachedCharacterWidth;
		},

		characterHeight: function() {
			if (!this._cachedCharacterHeight) {
				this._cachedCharacterHeight = $(this.terminalElement).find('div').innerHeight();
			}
			return this._cachedCharacterHeight;
		},

		// TODO: use this for changing number of tty columns on window resize (stty -F ttys### columns x)
		getWindowColumns: function() {
			return Math.floor($(window).width() / this.characterWidth());
		},

		// TODO: use this for changing number of tty rows on window resize (stty -F ttys### rows x)
		getWindowRows: function() {
			return Math.floor($(window).height() / this.characterHeight());
		},

		output: function(data) {			
			this.term.write(data);
			this.renderEachDirtyLine();
			this.scrollToBottom();
			//this.startCursorBlinking();
			this._lastMessageType = OUTPUT;
		}
	};
	
	window.TermJS = Terminal('#terminal');
})();
