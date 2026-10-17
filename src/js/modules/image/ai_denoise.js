import app from './../../app.js';
import config from './../../config.js';
import Pixel_selection_class from './../../core/pixel-selection.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, val } from './adjust.js';
import { denoise } from './../../core/ai-denoise.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Filter > Noise > AI Denoise (like Camera Raw "Denoise")
 */
class Image_ai_denoise_class {

	constructor() {
		this.dialog = new Adjust_dialog();
		this.busy = false;
	}

	ai_denoise() {
		var _this = this;
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('래스터 레이어에서만 사용할 수 있습니다.');
			return;
		}
		if (this.busy) return;
		var w = layer.width_original || layer.link.width, h = layer.height_original || layer.link.height;
		var tiles = Math.ceil(w / 208) * Math.ceil(h / 208);
		this.dialog.open({
			title: 'AI 노이즈 감소',
			reset: false,
			body: slider_row('dn_strength', '양(%)', 0, 100, 70)
				+ '<div class="adj_hint">' + w + '×' + h + ' 픽셀 · 조각 ' + tiles + '개를 처리합니다. 큰 사진은 몇 분 걸릴 수 있어요.</div>',
			on_open: function (el) { bind_sliders(el, function () {}); },
			on_preview_toggle: function () {},
			on_ok: function () {
				var strength = val(_this.dialog_root(), 'dn_strength');
				_this.run(layer, strength / 100);
			},
			on_cancel: function () {},
		});
		this.root = this.dialog.el;
	}

	dialog_root() {
		return this.root;
	}

	async run(layer, strength) {
		this.busy = true;
		var w = layer.width_original || layer.link.width, h = layer.height_original || layer.link.height;
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var src = ctx.getImageData(0, 0, w, h);
		var dst = ctx.createImageData(w, h);
		var note = alertify.message('AI 노이즈 감소 0%', 0);
		var t = performance.now();
		try {
			var provider = await denoise(src.data, dst.data, w, h, strength, function (p) {
				note.setContent('AI 노이즈 감소 ' + Math.round(p * 100) + '%');
			});
			var selection = new Pixel_selection_class();
			if (selection.has()) selection.blend_arrays(src.data, dst.data, layer);
			ctx.putImageData(dst, 0, 0);
			await app.State.do_action(new app.Actions.Bundle_action('ai_denoise', 'AI 노이즈 감소', [
				new app.Actions.Update_layer_image_action(canvas, layer.id),
			]));
			this.last = { ms: Math.round(performance.now() - t), provider: provider };
		}
		catch (e) {
			console.error(e);
			alertify.error('AI 노이즈 감소에 실패했습니다: ' + (e && e.message ? e.message : e));
		}
		finally {
			note.dismiss();
			this.busy = false;
		}
	}
}

export default Image_ai_denoise_class;
