import app from './../../app.js';
import config from './../../config.js';
import { make_surface } from './../../core/layer-surface.js';
import { hd_from_rgb16 } from './../../core/hd-image.js';
import { open_hd_image } from './hd_io.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

const RAW_EXT = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|raf|orf|rw2|pef|srw|x3f|3fr|iiq|erf|kdc|mef|mos|mrw|rwl)$/i;
const WASM_URL = '/node_modules/@colorhythm/libraw-wasm/dist/libraw.wasm';

export function is_raw(file) {
	return !!(file && RAW_EXT.test(file.name || ''));
}

/**
 * decodes a camera RAW file (LibRaw: demosaic, camera white balance, sRGB) to a canvas
 */
export async function decode_raw(file) {
	var lib = await import('@colorhythm/libraw-wasm');
	var LibRaw = lib.LibRaw;
	await LibRaw.initialize(fetch(WASM_URL));
	var decoder = new LibRaw();
	await decoder.waitUntilReady();
	try {
		decoder.open(await file.arrayBuffer());
		decoder.setUseCameraWb(1);
		decoder.setOutputColor(1);
		//16 bit output: the document opens in 16 bits/channel like Camera Raw
		decoder.setOutputBps(16);
		decoder.unpack();
		decoder.dcrawProcess();
		var image = decoder.dcrawMakeMemImage();
		var w = image.width, h = image.height, colors = image.colors, data = image.data;
		if (image.bits == 16) {
			return { hd: hd_from_rgb16(data, w, h, colors), width: w, height: h };
		}
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');
		var out = ctx.createImageData(w, h);
		var step = image.bits == 16 ? 2 : 1;
		for (var i = 0, j = 0; i < w * h; i++, j += 4) {
			for (var c = 0; c < 3; c++) {
				var src = (i * colors + Math.min(c, colors - 1)) * step;
				out.data[j + c] = step == 2 ? data[src + 1] : data[src];
			}
			out.data[j + 3] = 255;
		}
		ctx.putImageData(out, 0, 0);
		return canvas;
	}
	finally {
		decoder.dispose();
	}
}

/**
 * File > Open with a RAW file: like Photoshop the image opens and Camera Raw comes up
 */
export async function open_raw(file) {
	var note = alertify.message('RAW 파일을 해석하는 중… (' + file.name + ')', 0);
	try {
		var canvas = await decode_raw(file);
		if (canvas.hd) {
			await open_hd_image(file.name, canvas.hd, canvas.width, canvas.height);
		}
		else await app.State.do_action(new app.Actions.Bundle_action('open_image', '열기', [
			new app.Actions.Insert_layer_action({
				name: file.name, type: 'image', link: make_surface(canvas),
				width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
			}),
			new app.Actions.Autoresize_canvas_action(canvas.width, canvas.height, null, true, true),
		]));
		await new Promise(function (r) { setTimeout(r, 300); });
		app.GUI.GUI_preview.zoom_auto(true);
		app.GUI.modules['image/camera_raw'].camera_raw();
	}
	catch (e) {
		console.error(e);
		alertify.error('RAW 파일을 열지 못했습니다: ' + (e && e.message ? e.message : e));
	}
	finally {
		note.dismiss();
	}
}

class File_raw_class {
}

export default File_raw_class;
