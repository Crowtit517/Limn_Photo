import app from './../../app.js';
import config from './../../config.js';
import { make_surface } from './../../core/layer-surface.js';
import { canvas_from_hd, hd_of, float_from_hd, hd_from_float, hd_from_canvas } from './../../core/hd-image.js';
import { decode_png16, encode_png16, png_bit_depth } from './../../core/png16.js';
import { build_adjustment } from './../image/adjust.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * opens 16 bit pixels as a new 16 bit document layer (RAW, 16 bit PNG)
 */
export async function open_hd_image(name, hd, width, height) {
	var surface = make_surface(canvas_from_hd(hd, width, height));
	surface._hd = hd;
	await app.State.do_action(new app.Actions.Bundle_action('open_image', '열기', [
		new app.Actions.Update_config_action({ BIT_DEPTH: 16 }),
		new app.Actions.Insert_layer_action({
			name: name, type: 'image', link: surface,
			width: width, height: height, width_original: width, height_original: height,
		}),
		new app.Actions.Autoresize_canvas_action(width, height, null, true, true),
	]));
	window.dispatchEvent(new Event('photolab-history'));
}

/**
 * true when the file is a 16 bit PNG (opened by open_png16)
 */
export async function is_png16(file) {
	if (!/\.png$/i.test(file.name || '') && file.type != 'image/png') return false;
	var head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
	return png_bit_depth(head) == 16;
}

export async function open_png16(file) {
	var result = await decode_png16(await file.arrayBuffer());
	if (!result) return false;
	await open_hd_image(file.name, result.hd, result.width, result.height);
	setTimeout(function () { app.GUI.GUI_preview.zoom_auto(true); }, 200);
	return true;
}

/**
 * 16 bit composite of the document: a full size 16 bit photo layer with adjustment layers above
 * (the usual photo retouch stack). null when other layers are visible.
 */
export function composite_hd() {
	var W = config.WIDTH, H = config.HEIGHT;
	//bottom to top
	var layers = app.Layers.get_sorted_layers().slice().reverse().filter(function (l) { return l.visible !== false; });
	if (!layers.length) return null;
	var base = layers[0];
	var ok = base.type == 'image' && hd_of(base) && Math.round(base.x) == 0 && Math.round(base.y) == 0
		&& base.width == W && base.height == H && base.link.width == W && base.link.height == H
		&& (base.opacity == null || base.opacity == 100) && (!base.composition || base.composition == 'source-over' || base.composition == 'normal')
		&& !base._mask && !(base.styles && base.styles.length) && !base.rotate;
	if (!ok) return null;
	var rest = layers.slice(1);
	if (rest.some(function (l) { return l.type != 'adjustment' || (l.composition && l.composition != 'source-over' && l.composition != 'normal'); })) return null;
	var src = float_from_hd(hd_of(base));
	rest.forEach(function (layer) {
		if (!layer.params || !layer.params.kind) return;
		var out = new Float32Array(src.length);
		build_adjustment(layer.params.kind, layer.params)(src, out, W, H);
		var amount = (layer.opacity == null ? 100 : layer.opacity) / 100;
		var mask = null;
		if (layer._mask && layer._mask.enabled !== false && layer._mask.canvas) {
			var m = document.createElement('canvas');
			m.width = W;
			m.height = H;
			var mctx = m.getContext('2d', { willReadFrequently: true });
			mctx.drawImage(layer._mask.canvas, 0, 0);
			mask = mctx.getImageData(0, 0, W, H).data;
		}
		for (var i = 0; i < src.length; i += 4) {
			var k = mask ? amount * mask[i] / 255 : amount;
			for (var c = 0; c < 3; c++) {
				var v = src[i + c] + (out[i + c] - src[i + c]) * k;
				src[i + c] = v > 0 ? (v < 255 ? v : 255) : 0;
			}
		}
	});
	return hd_from_float(src);
}

class File_hd_io_class {

	/**
	 * File > Export > 16 bit PNG
	 */
	async export_png16() {
		if (!config.WIDTH) return;
		var result = await this.build_png16();
		var blob = result.blob;
		var name = (config.layers[0] && config.layers[0].name ? config.layers[0].name.replace(/\.[^.]+$/, '') : 'limn') + '_16bit.png';
		var a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
		if (result.note) alertify.message(result.note, 8);
		else alertify.success('16비트 PNG로 저장했습니다.');
		return blob;
	}

	/**
	 * the 16 bit PNG of the document: { blob, precise, note }
	 */
	async build_png16() {
		var hd = config.BIT_DEPTH == 16 ? composite_hd() : null;
		var note = null;
		if (!hd) {
			//other layer stacks: 8 bit composite stored in a 16 bit file
			var canvas = document.createElement('canvas');
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
			hd = hd_from_canvas(canvas);
			note = config.BIT_DEPTH == 16
				? '16비트 정밀도는 "16비트 사진 1장 + 조정 레이어" 구성에서 유지됩니다. 지금은 화면 합성(8비트)을 16비트 파일로 저장했어요.'
				: '문서가 8비트라 8비트 값을 16비트 파일로 저장했어요. 이미지 > 모드 > 16비트/채널에서 보정하면 정밀도가 유지됩니다.';
		}
		var blob = await encode_png16(hd, config.WIDTH, config.HEIGHT);
		return { blob: blob, precise: !note, note: note };
	}
}

export default File_hd_io_class;
