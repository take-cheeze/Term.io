(function() {
	"use strict";
	
	// Constants
	var INPUT = 1, OUTPUT = 0;

	function Terminal(){
		if ( this instanceof Terminal ) {
			var lowLevelTerm = new Term();
			lowLevelTerm.bell = function() {
				document.getElementById('beep').play(3);
			};
			
			this.terminalId = 'terminal';
			this.cursorId = 'cursor';
			this.stylesheetId = 'terminal-css';
			this.cursorBlinkId = undefined;
			this.term = lowLevelTerm;
			this.stdin = $.noop;
			this.colors = null;
			this.lastScrollTop = null;
			this.lastScrollSnap = null;
			this.cachedNumberOfLines = null;
			this.cachedCharWidth = null;
			this.cachedCharHeight = null;
			this.lastMessageType = INPUT;
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
			
			var debouncedScrollSnap = _.debounce(_.bind(this.scrollSnap, this),150);
			var throttledResize = _.throttle(_.bind(this.onWindowResize,this),200);
			$(window).bind('scroll',debouncedScrollSnap)
			.bind('resize',debouncedScrollSnap)
			.bind('resize',throttledResize)
			.bind('keydown',_.bind(this.onKeydown,this))
			.bind('keypress',_.bind(this.onKeypress,this))
			.bind('paste',_.bind(this.onPaste,this))
			.bind('resize',_.bind(this.scrollToBottom,this));
			
		} else {
			return new Terminal();
		}
	}

	Terminal.prototype = {
		
		constructor: Terminal,
		
		setStdin: function(fn) {
			this.stdin = fn;
		},
		
		input: function(data){
			this.lastMessageType = INPUT;
			this.sendMessage("input",data);
		},
		
		onConnect: function(termId, stdin){			
			TermJS.setStdin(stdin);
			this.sendMessage("init",{"id":termId,"rows":this.getWindowRows(),"cols":this.getWindowCols()});
			$('.loading-container').hide();
		},
		
		onDisconnect: function(){
			this.setStdin($.noop);
			$('.loading-container').show();
		},
		
		onKeydown: function(e) {
			var mods   = e.shiftKey || e.ctrlKey || e.altKey;
			var onlyCtrl  = e.ctrlKey  && !(e.shiftKey || e.altKey);
			var ctrlShift = e.ctrlKey  && e.shiftKey && !e.altKey;
			var SS3Seq = '\u001BO';
			var CSISeq = '\u001B[';
			var arrowSeq = this.term.flags.appCursorKeys ? SS3Seq : CSISeq;
			if (!mods && (e.which === 8 || e.which === 9 || e.which === 27)) { //backspace tab esc
				this.input(String.fromCharCode(e.which));
			} else if (!mods && e.which === 37) { // Left arrow
				this.input(arrowSeq+'D');
			} else if (!mods && e.which === 38) { // Up arrow
				this.input(arrowSeq+'A');
			} else if (!mods && e.which === 39) { // Right arrow
				this.input(arrowSeq+'C');
			} else if (!mods && e.which === 40) { // Down arrow
				this.input(arrowSeq+'B');
			} else if (onlyCtrl && e.which >= 65 && e.which <= 90) { // make Ctrl + A-Z work for lowercase
				this.input(String.fromCharCode(e.which - 64));
			} else if (ctrlShift && e.which === 84) { // Ctrl Shift t to open  new tab
				window.open(location.href);
			} else if (ctrlShift && e.which === 87) { // Ctrl Shift w to close tab
				window.close();
			} else {
				return;
			}
			// event was handled
			return false;
		},
		
		onKeypress: function(e) {
			this.input(String.fromCharCode(e.which));
			return false;
		},
		
		onPaste: function(e){
			this.input(e.originalEvent.clipboardData.getData('text/plain'));
			return false;
		},
		
		onWindowResize: function(){
			this.sendMessage("resize",{"rows":this.getWindowRows(),"cols":this.getWindowCols()});
		},
		
		ttyResizeDone: function(data){
			this.term.resize(data.rows,data.cols);
			var termHeightPx = data.rows * this.characterHeight();
			var termWidthPx = data.cols * this.characterWidth();
			$(".loading-container, #term-bg").css({'height':termHeightPx,'width':termWidthPx});
			$("#terminal").css({'width':termWidthPx});
			this.lastScrollTop = $(window).scrollTop();
		},

		applyTheme: function(css) {
			if (!document.getElementById(this.stylesheetId)) {
				$('<style type="text/css" id="' + this.stylesheetId + '">' + css + '</style>').appendTo($('head'));
			} else {
				$('#' + this.stylesheetId).html(css);
			}
		},

		theme: function(newColors) {
			this.colors = newColors.slice(0);
			this.applyTheme(this.compileThemeToCss());
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
			return 'color: ' + this.colors[fgIndex] + ';' +
				(bgIndex !== 16 || inverse || selected ? ' background: ' + this.colors[bgIndex] + ';' : '') +
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

		render: function(iterator) {
			var toRender;
			if(this.term.redrawAll){
				toRender = _.range(this.term.grid.length);
				$('#'+this.terminalId).empty();
				this.term.redrawAll = false;
			} else {
				toRender = _(this.term.dirtyLines).chain().keys().map(function(a){return parseInt(a,10);}).value();
			}
			this.cachedNumberOfLines = null;
			for (var i = 0; i < toRender.length; i++) {
				var lineNo = toRender[i];
				var missingLines = lineNo - this.numberOfLines() + 1;
				if (missingLines > 1) {
					console.error("Missing Lines: should this happen?");
					var html = '';
					for (var j = 0; j < missingLines; j++) {
						html += '<div></div>';
						this.cachedNumberOfLines++;
					}
					$('#'+this.terminalId).append(html);
				}
				var $div = $("<div>");
				if (missingLines == 1){
					$('#'+this.terminalId).append($div);
					this.cachedNumberOfLines++;
				} else {					
					$div = $('#'+this.terminalId).children().eq(lineNo);
					$div.empty();
				}
				this.renderLineAsHtml(lineNo,$div);
			}
			this.cachedNumberOfLines = null;
			this.term.dirtyLines = {}; // Reset list of dirty lines after rendering
		},
		
		scrollSnap: function() {
			var characterHeight = this.characterHeight();
			var position = $(window).scrollTop();
			var snapPosition = Math.floor(position / characterHeight) * characterHeight;
			if (snapPosition !== this.lastScrollSnap) {
				$(window).scrollTop(snapPosition);
				this.lastScrollSnap = snapPosition;
			}
		},

		scrollToBottom: function() {
			var firstLine = Math.max(this.numberOfLines() - this.term.rows, 0);
			var termTop = firstLine * this.characterHeight();
			
			// if there is output that is not a direct response to input and we are scrolling up,
			// don't scroll down on output
			// if(this.lastMessageType == OUTPUT && $(window).scrollTop() > this.lastScrollTop){
			//	return;
			// }

			if (termTop !== this.lastScrollTop) {
				// Make room to scroll
				$('html').height(termTop + $(window).height());
				$(window).scrollTop(termTop);
				this.lastScrollTop = termTop;
			}
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
			if (!this.cachedNumberOfLines) {
				this.cachedNumberOfLines = $('#'+this.terminalId).find('div').size();
			}
			return this.cachedNumberOfLines;
		},

		characterWidth: function() {
			return 7;
			// // TODO make work before terminal is initialized
			// if (!this.cachedCharWidth) {
			//	this.cachedCharWidth = $('#'+this.cursorId).innerWidth();
			// }
			// return this.cachedCharWidth;
		},

		characterHeight: function() {
			return 14;
			// // TODO make work before terminal is initialized
			// if (!this.cachedCharHeight) {
			//	this.cachedCharHeight = $('#'+this.terminalId).find('div:first').innerHeight();
			// }
			// return this.cachedCharHeight;
		},

		getWindowCols: function() {
			return Math.floor($(window).width() / this.characterWidth());
		},

		getWindowRows: function() {
			return Math.floor($(window).height() / this.characterHeight());
		},

		output: function(data) {			
			this.term.write(data);
			this.render();
			this.scrollToBottom();
			//this.startCursorBlinking();
			this.lastMessageType = OUTPUT;
		},
		
		sendMessage: function(method, data){
			var msg = {"method":method, "data":data};
			this.stdin(JSON.stringify(msg));
		},
		
		handleMessage: function(msgText){
			var msg = JSON.parse(msgText);
			if( !"method" in msg || !"data" in msg){
				return;
			}
			if(_(['output','ttyResizeDone']).contains(msg.method)){
				this[msg.method](msg.data);
			}
		}
	
	};

	window.TermJS = Terminal();
})();
