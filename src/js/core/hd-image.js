/*
 * 16 bit per channel image data (Photoshop Image > Mode > 16 Bits/Channel).
 *
 * A layer surface may carry `_hd`: Uint16Array RGBA (0..65535) of the same size.
 * The canvas itself stays 8 bit (ordered dither of the 16 bit data) for display and for tools
 * that only know 8 bit. Undo swaps surfaces, so the 16 bit data travels with history for free.
 *
 * - adjustments / Camera Raw run on float copies of the 16 bit data (no banding when stacking edits)
 * - 8 bit tools (brush, filters...) change the canvas: changed pixels are merged back into the 16 bit data
 */
import config from './../config.js';

// 4x4 ordered dither (-0.5 .. 0.5)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16 - 0.5; });

export function is_16bit() {
	return config.BIT_DEPTH == 16;
}

/**
 * 16 bit data of an image layer, if it matches the layer surface
 */
export function hd_of(layer) {
	var link = layer && layer.link;
	if (!link || !link._hd) return null;
	if (link._hd.length != link.width * link.height * 4) return null;
	return link._hd;
}

function pixels(source) {
	//layer links can be canvases (surfaces) or plain images
	var canvas = source;
	if (typeof source.getContext != 'function') {
		canvas = document.createElement('canvas');
		canvas.width = source.naturalWidth || source.width;
		canvas.height = source.naturalHeight || source.height;
		canvas.getContext('2d').drawImage(source, 0, 0);
	}
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 8 bit canvas -> 16 bit data (x 257, so 255 -> 65535)
 */
export function hd_from_canvas(canvas) {
	var data = pixels(canvas).data;
	var hd = new Uint16Array(data.length);
	for (var i = 0; i < data.length; i++) hd[i] = data[i] * 257;
	return hd;
}

/**
 * 16 bit data -> 8 bit canvas, ordered dither keeps smooth gradients
 */
export function canvas_from_hd(hd, width, height, canvas) {
	canvas = canvas || document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	var ctx = canvas.getContext('2d');
	var image = ctx.createImageData(width, height);
	var out = image.data;
	for (var y = 0, i = 0; y < height; y++) {
		var row = (y & 3) * 4;
		for (var x = 0; x < width; x++, i += 4) {
			var d = BAYER[row + (x & 3)];
			out[i] = hd[i] / 257 + d;
			out[i + 1] = hd[i + 1] / 257 + d;
			out[i + 2] = hd[i + 2] / 257 + d;
			out[i + 3] = hd[i + 3] / 257 + 0.5;
		}
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}

/**
 * float copy (0..255 with fractions) for adjustment processes
 */
export function float_from_hd(hd) {
	var f = new Float32Array(hd.length);
	for (var i = 0; i < hd.length; i++) f[i] = hd[i] / 257;
	return f;
}

export function hd_from_float(f) {
	var hd = new Uint16Array(f.length);
	for (var i = 0; i < f.length; i++) {
		var v = f[i] * 257;
		hd[i] = v > 0 ? (v < 65535 ? v + 0.5 : 65535) : 0;
	}
	return hd;
}

/**
 * after an 8 bit tool changed the canvas: keep 16 bit values where the pixel is unchanged
 * (within the dither), take the new 8 bit value where the tool painted
 */
export function merge_hd(old_hd, canvas) {
	var data = pixels(canvas).data;
	if (!old_hd || old_hd.length != data.length) {
		var fresh = new Uint16Array(data.length);
		for (var k = 0; k < data.length; k++) fresh[k] = data[k] * 257;
		return fresh;
	}
	var hd = new Uint16Array(data.length);
	for (var i = 0; i < data.length; i += 4) {
		var same = true;
		for (var c = 0; c < 4; c++) {
			if (Math.abs(data[i + c] - old_hd[i + c] / 257) > 1.01) {
				same = false;
				break;
			}
		}
		if (same) {
			hd[i] = old_hd[i];
			hd[i + 1] = old_hd[i + 1];
			hd[i + 2] = old_hd[i + 2];
			hd[i + 3] = old_hd[i + 3];
		}
		else {
			hd[i] = data[i] * 257;
			hd[i + 1] = data[i + 1] * 257;
			hd[i + 2] = data[i + 2] * 257;
			hd[i + 3] = data[i + 3] * 257;
		}
	}
	return hd;
}

/**
 * runs an adjustment process on the 16 bit data of a layer.
 * returns { canvas (8 bit, dithered), hd (16 bit) }
 */
export function run_hd(layer, process, blend) {
	var surface = layer.link;
	var width = surface.width, height = surface.height;
	var hd = hd_of(layer) || hd_from_canvas(surface);
	var src = float_from_hd(hd);
	var dst = new Float32Array(src.length);
	process(src, dst, width, height);
	if (blend) blend(src, dst);
	for (var i = 0; i < dst.length; i++) {
		var v = dst[i];
		dst[i] = v > 0 ? (v < 255 ? v : 255) : (v === v ? 0 : src[i]);
	}
	var out = hd_from_float(dst);
	return { canvas: canvas_from_hd(out, width, height), hd: out };
}

/**
 * 16 bit RGBA from little endian 16 bit RGB / RGBA bytes (LibRaw), or a Uint16Array
 */
export function hd_from_rgb16(data, width, height, colors) {
	var hd = new Uint16Array(width * height * 4);
	var words = data instanceof Uint16Array ? data : new Uint16Array(data.buffer, data.byteOffset, data.byteLength >> 1);
	for (var i = 0, j = 0; i < width * height; i++, j += 4) {
		for (var c = 0; c < 3; c++) hd[j + c] = words[i * colors + Math.min(c, colors - 1)];
		hd[j + 3] = colors == 4 ? words[i * colors + 3] : 65535;
	}
	return hd;
}
