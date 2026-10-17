import app from './../../app.js';
import config from './../../config.js';
import { hd_from_canvas } from './../../core/hd-image.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Image > Mode > 8 / 16 Bits/Channel
 */
class Image_mode_class {

	to_16bit() {
		if (config.BIT_DEPTH == 16) {
			alertify.message('이미 16비트/채널입니다.');
			return;
		}
		//every pixel layer gets 16 bit data (same values, more room for later edits)
		config.layers.forEach(function (layer) {
			if (layer.type == 'image' && layer.link && layer.link._surface && !layer.link._hd) {
				layer.link._hd = hd_from_canvas(layer.link);
			}
		});
		var action = new app.Actions.Update_config_action({ BIT_DEPTH: 16 });
		action.action_description = '16비트/채널';
		return app.State.do_action(action).then(refresh_title);
	}

	to_8bit() {
		if (config.BIT_DEPTH != 16) {
			alertify.message('이미 8비트/채널입니다.');
			return;
		}
		var action = new app.Actions.Update_config_action({ BIT_DEPTH: 8 });
		action.action_description = '8비트/채널';
		return app.State.do_action(action).then(refresh_title);
	}
}

function refresh_title() {
	window.dispatchEvent(new Event('photolab-history'));
	config.need_render = true;
}

export default Image_mode_class;
