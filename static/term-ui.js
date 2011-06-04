(function() {
	"use strict";
	
	// Constants
	var INPUT = 1, OUTPUT = 0;

	function Terminal(){
		if ( this instanceof Terminal ) {
			this.term = new Term();
			
			this.$termdiv = $('#terminal');
			// window or div
			this.scrollingType = 'window';
			if(this.scrollingType === 'div'){
				this.$scrollingElt = this.$termdiv;
			} else {
				this.$scrollingElt = $(window);
			}
			this.plugins = {};
			this.cursorId = 'cursor';
			this.cursorAttr = 0;
			this.stylesheetId = 'terminal-css';
			this.cursorBlinkId = undefined;
			this.stdin = $.noop;
			this.colors = null;
			this.lastScrollTop = null;
			this.lastScrollSnap = null;
			this.numLines = 0;
			this.charWidth = 7;
			this.charHeight = 14;
			this.lastMessageType = INPUT;
			this.themes = {
				'Terminal.app': [
					'#000000', '#c23621', '#25bc24', '#adad27', '#492ee1', '#d338d3', '#33bbc8', '#cbcccd', 
					'#818383', '#fc391f', '#25bc24', '#eaec23', '#5833ff', '#f935f8', '#14f0f0', '#e9ebeb',
					'#ffffff', '#1a1a1a']
			};
			
			var debouncedScrollSnap = _.debounce(_.bind(this.scrollSnap, this),150);
			var throttledResize = _.throttle(_.bind(this.onWindowResize,this),200);
			$(window).bind('scroll',debouncedScrollSnap);
			$(window).bind('resize',debouncedScrollSnap);
			$(window).bind('resize',throttledResize);
			$(window).bind('keydown',_.bind(this.onKeydown,this));
			$(window).bind('keypress',_.bind(this.onKeypress,this));
			$(window).bind('paste',_.bind(this.onPaste,this));
			$(window).bind('resize',_.bind(this.scrollToBottom,this));
			
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
		
		send: function(data){
			this.sendMessage("send",data);
		},
		
		bell: function(){
			document.getElementById('beep').play(3);
		},
		
		onConnect: function(termId, stdin){			
			TermJS.setStdin(stdin);
			this.term.send = _.bind(this.send,this);
			this.term.appMessage = _.bind(this.appMessage,this);
			this.term.bell = this.bell;
			this.sendMessage("init",{"id":termId,"rows":this.getMaxRows(),"cols":this.getMaxCols()});
			$('.loading-container').hide();
		},
		
		onDisconnect: function(){
			this.setStdin($.noop);
			$('.loading-container').show();
		},
		
		onKeydown: function(e) {
			if( document.activeElement !== document.body){
				return;
			}
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
			if( document.activeElement !== document.body){
				return;
			}
			this.input(String.fromCharCode(e.which));
			return false;
		},
		
		onPaste: function(e){
			this.input(e.originalEvent.clipboardData.getData('text/plain'));
			return false;
		},
		
		onWindowResize: function(){
			this.sendMessage("resize",{"rows":this.getMaxRows(),"cols":this.getMaxCols()});
		},
		
		appMessage: function(data){
			if( data.plugin in this.plugins ){
				this.plugins[data.plugin][data.method].call(this, data);
			}
			// TODO: handle loading plugins if they are not loaded
		},
		
		ttyResizeDone: function(data){
			this.term.resize(data.rows,data.cols);
			this.resizeUi();
		},
		
		resizeUi: function(){
			var termHeightPx = this.term.rows * this.characterHeight();
			var termWidthPx = this.term.cols * this.characterWidth();
			$(".loading-container, .term-bg").css({'height':termHeightPx,'width':termWidthPx});
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
			var css = '';
			var misc, bg, fg;
			for (misc = 0; misc <= 3; misc++) {
				for (bg = 0; bg <= 8; bg++) {
					for (fg = 0; fg <= 8; fg++) {
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

		renderLineAsHtml: function(lineNo, $div) {
			var cursor = this.term.cursor;
			var grid = this.term.grid;
			if (lineNo >= grid.length){
				return;
			}
			var line = grid[lineNo];
			var lineLength = line.length;
			if (lineNo === cursor.y && cursor.x + 1 > lineLength) {
				lineLength = cursor.x + 1;
			}

			var spanOpen = false;
			var lastStyle = null;
			var text = "";
			var i;
			for (i = 0; i < lineLength; i++) {
				var ach = line[i] || [cursor.attr, ' '];
				var a  = ach[0];
				var ch = ach[1];
				var isCursor = (lineNo === cursor.y && i === cursor.x && cursor.visible);
				if (isCursor) {
					a ^= 0x200;
					this.cursorAttr = a;
				}
				var cursorId = (isCursor ? ' id="' + this.cursorId + '"' : '');
				var style = (a & 0x400 ? ' style="text-decoration: underline;"' : '');
				

				if(a !== lastStyle){
					if(text.length > 0){
						if(spanOpen){
							$div.find('span:last').text(text);
						} else {
							$div.append(document.createTextNode(text));
						}
					}
					spanOpen = false;
					text = '';
					if(a !== 0x88){
						$div.append('<span class="' + this.attrToClass(a) + '"' + cursorId + style + '>');
						spanOpen = true;
					}
				}
				text += ch;
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
				this.$termdiv.empty();
				this.term.redrawAll = false;
			} else {
				toRender = _(this.term.dirtyLines).chain().keys().map(function(a){return parseInt(a,10);}).value();
			}
			this.numLines = null;
			var i;
			for (i = 0; i < toRender.length; i++) {
				var lineNo = toRender[i];
				var missingLines = lineNo - this.numberOfLines() + 1;
				if (missingLines > 1) {
					console.error("Missing Lines: should this happen?");
					var html = '';
					var j;
					for (j = 0; j < missingLines; j++) {
						html += '<div></div>';
						this.numLines++;
					}
					this.$termdiv.append(html);
				}
				var $div = $("<div>");
				if (missingLines === 1){
					this.$termdiv.append($div);
					this.numLines++;
				} else {					
					$div = this.$termdiv.children().eq(lineNo);
					$div.empty();
				}
				this.renderLineAsHtml(lineNo,$div);
			}
			this.numLines = null;
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
			// if(this.lastMessageType == OUTPUT && this.$scrollingElt.scrollTop() > this.lastScrollTop){
			//	return;
			// }

			if (termTop !== this.lastScrollTop) {
				// Make room to scroll
				if(this.scrollingType === "window"){
					$('html').height(termTop + $(window).height());
				}
				this.$scrollingElt.scrollTop(termTop);
				this.lastScrollTop = termTop;
			}
		},

		startCursorBlinking: function() {
			this.stopCursorBlinking();
			var cursor = $('#' + this.cursorId);
			var cursorClass = this.attrToClass( this.cursorAttr);
			var invClass = this.attrToClass(this.cursorAttr ^ 0x200);
			this.cursorBlinkId = window.setInterval(function() {
				if(cursor.attr('class') === cursorClass){
					cursor.removeClass().addClass(invClass);
				} else {
					cursor.removeClass().addClass(cursorClass);
				}
			}, 500);
		},

		stopCursorBlinking: function() {
			window.clearInterval(this.cursorBlinkId);
		},

		numberOfLines: function() {
			if (!this.numLines) {
				this.numLines = this.$termdiv.find('div').size();
			}
			return this.numLines;
		},

		characterWidth: function() {
			return 7;
			// // TODO make work before terminal is initialized
			// if (!this.charWidth) {
			//	this.charWidth = $('#'+this.cursorId).innerWidth();
			// }
			// return this.charWidth;
		},

		characterHeight: function() {
			return 14;
			// // TODO make work before terminal is initialized
			// if (!this.charHeight) {
			//	this.charHeight = $('#'+this.g).find('div:first').innerHeight();
			// }
			// return this.charHeight;
		},

		getMaxCols: function() {
			return Math.floor($(window).width() / this.characterWidth());
		},

		getMaxRows: function() {
			return Math.floor($(window).height() / this.characterHeight());
		},
		
		init: function(data) {
			this.term.setState(data);
			this.term.debugOn = true;
			this.resizeUi();
			this.term.redrawAll = true;
			this.render();
			this.scrollToBottom();
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
			if( !("method" in msg) || !("data" in msg)){
				return;
			}
			if(_(['output','ttyResizeDone','init']).contains(msg.method)){
				this[msg.method](msg.data);
			}
		}
	};

	window.TermJS = Terminal();
}());
