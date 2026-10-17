import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Image_flip_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	vertical() {
		this.flip('vertical');
	}

	horizontal() {
		this.flip('horizontal');
	}

	flip(mode) {
		if (config.layer.type != 'image') {
			alertify.error('이미지 레이어에서만 사용할 수 있습니다. 먼저 레이어를 래스터화하세요.');
			return;
		}

		//get canvas from layer
		var canvas = this.Base_layers.convert_layer_to_canvas(null, true);
		var ctx = canvas.getContext("2d");

		//create destination canvas
		var canvas2 = document.createElement('canvas');
		canvas2.width = canvas.width;
		canvas2.height = canvas.height;
		var ctx2 = canvas2.getContext("2d");
		canvas2.dataset.x = canvas.dataset.x;
		canvas2.dataset.y = canvas.dataset.y;

		//flip
		if (mode == 'vertical') {
			ctx2.scale(1, -1);
			ctx2.drawImage(canvas, 0, canvas2.height * -1);
		}
		else if (mode == 'horizontal') {
			ctx2.scale(-1, 1);
			ctx2.drawImage(canvas, canvas2.width * -1, 0);
		}

		//save
		return app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas2)
		);
	}

}

export default Image_flip_class;