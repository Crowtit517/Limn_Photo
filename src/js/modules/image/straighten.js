import app from './../../app.js';
import config from './../../config.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, val } from './adjust.js';

/**
 * Image > Straighten: rotate the whole image by a small angle and crop the empty corners
 */
class Image_straighten_class {

	constructor() {
		this.dialog = new Adjust_dialog();
	}

	inner_scale(W, H, angle) {
		var a = Math.abs(angle * Math.PI / 180), c = Math.cos(a), s = Math.sin(a);
		return Math.min(W / (W * c + H * s), H / (W * s + H * c));
	}

	straighten() {
		var _this = this;
		if (!config.WIDTH) return;
		var wrapper = document.getElementById('canvas_wrapper');
		var root = null;
		var preview = function () {
			var angle = val(root, 'st_angle');
			var crop = root.querySelector('#st_crop').checked;
			var k = crop ? 1 / _this.inner_scale(config.WIDTH, config.HEIGHT, angle) : 1;
			wrapper.style.transform = 'rotate(' + angle + 'deg) scale(' + k + ')';
			wrapper.classList.add('st_grid');
		};
		var restore = function () {
			wrapper.style.transform = '';
			wrapper.classList.remove('st_grid');
		};
		this.dialog.open({
			title: '기울기 보정',
			body: slider_row('st_angle', '각도(°)', -45, 45, 0, 0.1)
				+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="st_crop" checked> 빈 모서리 자르기</label></div>'
				+ '<div class="adj_hint">수평선이 격자와 나란해지도록 맞추세요</div>',
			on_open: function (el) {
				root = el;
				bind_sliders(el, preview);
				el.querySelector('#st_crop').addEventListener('change', preview);
				preview();
			},
			on_reset: function () {
				root.querySelector('#st_angle').value = 0;
				root.querySelector('.adj_num').value = 0;
				preview();
			},
			on_preview_toggle: function (on) { if (on) preview(); else restore(); },
			on_ok: function () {
				var angle = val(root, 'st_angle');
				var crop = root.querySelector('#st_crop').checked;
				restore();
				if (angle) _this.apply(angle, crop);
			},
			on_cancel: restore,
		});
	}

	async apply(angle, crop) {
		var W = config.WIDTH, H = config.HEIGHT;
		var k = crop ? this.inner_scale(W, H, angle) : 1;
		var nw = Math.floor(W * k), nh = Math.floor(H * k);
		var rad = -angle * Math.PI / 180;
		var actions = [];
		config.layers.forEach(function (layer) {
			if (layer.type != 'image' || !layer.link) return;
			var canvas = document.createElement('canvas');
			canvas.width = nw;
			canvas.height = nh;
			var ctx = canvas.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.translate(nw / 2, nh / 2);
			ctx.rotate(rad);
			ctx.translate(-W / 2, -H / 2);
			ctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
			actions.push(new app.Actions.Update_layer_image_action(canvas, layer.id));
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: nw, height: nh, width_original: nw, height_original: nh, rotate: 0,
			}));
		});
		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: nw, HEIGHT: nh }),
			new app.Actions.Prepare_canvas_action('do')
		);
		await app.State.do_action(new app.Actions.Bundle_action('straighten', '기울기 보정', actions));
	}
}

export default Image_straighten_class;
