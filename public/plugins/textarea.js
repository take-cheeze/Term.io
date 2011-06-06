TermJS.plugins.textarea = {
	load: function(data){
		var self = this;
		$('<div id="plug"><textarea></textarea><br><button class="save">Save</button><button class="close">Close</button></div>').appendTo('body');
		$('#plug textarea').text(data.data);
		$('#plug .close').click(function(){
			self.send(JSON.stringify({method: 'close'})+'\n');
			$('#plug').remove();
		});
		$('#plug .save').click(function(){
			self.send(JSON.stringify({method: 'save', data: $('#plug textarea').val()})+'\n');
		});
	},

	error: function(){
		console.error(data.data)
	}
}
