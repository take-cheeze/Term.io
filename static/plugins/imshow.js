TermJS.plugins.imshow = {
	load: function(data){
		var canvas = document.createElement('canvas')
		var ctx = canvas.getContext("2d");
		var img = new Image();
		img.src =  data.dataurl;
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);
		$('.terminal').append(canvas);
	},
}
