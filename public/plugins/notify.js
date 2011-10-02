TermJS.plugins.notify = {
	requestPermissions: function(data){
		var request = function(){
			window.webkitNotifications.requestPermission();
			$(window).unbind('keydown',request);
		};
		if (window.webkitNotifications.checkPermission() > 0) {
			$(window).keydown(request);
		}
	},
	
	notify: function(data){
		window.webkitNotifications.createHTMLNotification('data:text/html,'+data.data).show();
	}
};
