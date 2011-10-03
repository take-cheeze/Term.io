$(function() {
      "use strict";

      JSON.stringify = $.toJSON;
      JSON.parse = $.evalJSON;

      var socket = io.connect();
      socket.on('connect', function(){
                    TermJS.onConnect(location.pathname, socket);
                });
      TermJS.theme(TermJS.themes['Terminal.app']);

      /*
       // Simple echo terminal
       TermJS.output('\r\n> ');
       TermJS.setStdin( function(data) {
       TermJS.output(data.replace('\r', '\r\n> ').replace('\b', '\b \b'));
       });
       */
  });
