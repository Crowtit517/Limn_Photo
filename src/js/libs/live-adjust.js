/*
 * Photoshop-style adjustment dialogs: live preview on the canvas, OK / Cancel,
 * histogram and curve helpers.
 */
import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import Pixel_selection_class from './../core/pixel-selection.js';
import { is_16bit, run_hd } from './../core/hd-image.js';

// set by smart-object.js (avoids an import cycle)
export var hooks = { smart: null };

// above this many pixels the live preview works on a smaller copy
const PROXY_PIXELS = 3000000;

/**
 * runs adjustment, then keeps original pixels outside selection
 */
function run_in_selection(process, layer, src, dst, width, height) {
	process(src, dst, width, height);
	var selection = new Pixel_selection_class();
	if (selection.has()) {
		selection.blend_arrays(src, dst, layer);
	}
}

/**
 * Shows adjusted pixels of active layer while dialog is open.
 * process(src, dst) gets RGBA arrays of the whole layer image.
 */
export class Live_preview {

	constructor() {
		this.layer = null;
		this.base = null;
		this.out = null;
		this.pending = null;
	}

	start() {
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('래스터 레이어에서만 사용할 수 있습니다. 레이어를 선택하거나 래스터화하세요.');
			return false;
		}
		var w = layer.width_original || layer.link.width;
		var h = layer.height_original || layer.link.height;
		this.full_size = { w: w, h: h };
		//big photos: preview on a screen-sized proxy while dragging, full size only on OK
		var scale = 1;
		if (w * h > PROXY_PIXELS && !new Pixel_selection_class().has()) {
			scale = Math.sqrt(PROXY_PIXELS / (w * h));
		}
		this.proxy = scale < 1;
		w = Math.max(1, Math.round(w * scale));
		h = Math.max(1, Math.round(h * scale));
		var base = document.createElement('canvas');
		base.width = w;
		base.height = h;
		var ctx = base.getContext('2d', { willReadFrequently: true });
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(layer.link, 0, 0, w, h);
		this.layer = layer;
		this.base_data = ctx.getImageData(0, 0, w, h);
		this.out = document.createElement('canvas');
		this.out.width = w;
		this.out.height = h;
		this.out_ctx = this.out.getContext('2d');
		this.out_data = this.out_ctx.createImageData(w, h);
		return true;
	}

	get_source() {
		return this.base_data.data;
	}

	/**
	 * schedules preview, at most once per frame
	 */
	update(process) {
		var _this = this;
		var first = this.pending == null;
		this.pending = process;
		if (!first) return;
		requestAnimationFrame(function () {
			var fn = _this.pending;
			_this.pending = null;
			if (!_this.layer || !fn) return;
			run_in_selection(fn, _this.layer, _this.base_data.data, _this.out_data.data, _this.base_data.width, _this.base_data.height);
			_this.out_ctx.putImageData(_this.out_data, 0, 0);
			_this.layer.link_canvas = _this.out;
			config.need_render = true;
		});
	}

	commit(process, name, step) {
		if (!this.layer) return;
		var layer = this.layer;
		//smart object: becomes an editable smart filter instead of changing pixels
		if (step && layer.smart && hooks.smart) {
			delete layer.link_canvas;
			this.stop();
			hooks.smart(layer, step);
			config.need_render = true;
			return;
		}
		var hd = null;
		if (step && (step.op == 'adjust' || step.op == 'camera_raw') && is_16bit()) {
			//16 bit: compute on the high precision data, show a dithered 8 bit copy
			var selection = new Pixel_selection_class();
			var result = run_hd(layer, process, selection.has() ? function (src, dst) { selection.blend_arrays(src, dst, layer); } : null);
			hd = result.hd;
			this.out = result.canvas;
		}
		else if (this.proxy) {
			//apply to real pixels once
			var full = document.createElement('canvas');
			full.width = this.full_size.w;
			full.height = this.full_size.h;
			var fctx = full.getContext('2d', { willReadFrequently: true });
			fctx.drawImage(layer.link, 0, 0);
			var src = fctx.getImageData(0, 0, full.width, full.height);
			var dst = fctx.createImageData(full.width, full.height);
			run_in_selection(process, layer, src.data, dst.data, full.width, full.height);
			fctx.putImageData(dst, 0, 0);
			this.out = full;
		}
		else {
			run_in_selection(process, layer, this.base_data.data, this.out_data.data, this.base_data.width, this.base_data.height);
			this.out_ctx.putImageData(this.out_data, 0, 0);
		}
		var canvas = this.out;
		this.stop();
		//keep showing result until stored image is loaded
		layer.link_canvas = canvas;
		app.State.do_action(
			new app.Actions.Bundle_action('adjustment', name || 'Adjustment', [
				new app.Actions.Update_layer_image_action(canvas, layer.id, hd)
			])
		).then(function () {
			var clear = function () {
				if (layer.link_canvas === canvas) {
					delete layer.link_canvas;
					config.need_render = true;
				}
			};
			if (layer.link.complete) clear();
			else layer.link.addEventListener('load', clear, { once: true });
		});
	}

	cancel() {
		if (this.layer) {
			delete this.layer.link_canvas;
			config.need_render = true;
		}
		this.stop();
	}

	stop() {
		this.layer = null;
		this.pending = null;
	}
}

/**
 * Floating dialog, draggable by title, Enter = OK, Escape = Cancel.
 */
export class Adjust_dialog {

	open(options) {
		var _this = this;
		this.close();
		var el = document.createElement('div');
		el.className = 'adj_dialog';
		el.innerHTML = '<div class="adj_title">' + options.title + '</div>'
			+ '<div class="adj_body">' + options.body + '</div>'
			+ '<div class="adj_footer">'
			+ (options.reset !== false ? '<button type="button" class="adj_btn" data-act="reset">초기화</button>' : '')
			+ '<span class="adj_spacer"></span>'
			+ '<label class="adj_check"><input type="checkbox" data-act="preview" checked> 미리보기</label>'
			+ '<button type="button" class="adj_btn" data-act="cancel">취소</button>'
			+ '<button type="button" class="adj_btn primary" data-act="ok">확인</button>'
			+ '</div>';
		document.body.appendChild(el);
		this.el = el;
		this.options = options;

		el.querySelector('.adj_footer').addEventListener('click', function (e) {
			var act = e.target.dataset.act;
			if (act == 'ok') _this.finish(true);
			else if (act == 'cancel') _this.finish(false);
			else if (act == 'reset' && options.on_reset) options.on_reset();
		});
		el.querySelector('[data-act=preview]').addEventListener('change', function () {
			if (options.on_preview_toggle) options.on_preview_toggle(this.checked);
		});

		this.key_handler = function (e) {
			if (e.key == 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				_this.finish(false);
			}
			else if (e.key == 'Enter' && e.target.tagName != 'SELECT') {
				e.preventDefault();
				e.stopPropagation();
				_this.finish(true);
			}
		};
		document.addEventListener('keydown', this.key_handler, true);

		//drag by title
		var title = el.querySelector('.adj_title');
		title.addEventListener('mousedown', function (e) {
			var rect = el.getBoundingClientRect();
			var dx = e.clientX - rect.left, dy = e.clientY - rect.top;
			var move = function (ev) {
				el.style.left = (ev.clientX - dx) + 'px';
				el.style.top = (ev.clientY - dy) + 'px';
				el.style.transform = 'none';
			};
			var up = function () {
				document.removeEventListener('mousemove', move);
				document.removeEventListener('mouseup', up);
			};
			document.addEventListener('mousemove', move);
			document.addEventListener('mouseup', up);
		});

		if (options.on_open) options.on_open(el);
		return el;
	}

	is_preview_on() {
		return this.el ? this.el.querySelector('[data-act=preview]').checked : false;
	}

	finish(ok) {
		if (!this.el) return;
		var options = this.options;
		this.close();
		if (ok && options.on_ok) options.on_ok();
		if (!ok && options.on_cancel) options.on_cancel();
	}

	close() {
		if (this.el) {
			this.el.remove();
			this.el = null;
		}
		if (this.key_handler) {
			document.removeEventListener('keydown', this.key_handler, true);
			this.key_handler = null;
		}
	}
}

/**
 * histogram per channel: {r, g, b, l} arrays of 256 counts
 */
export function histogram(data) {
	var r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
	for (var i = 0; i < data.length; i += 4) {
		if (data[i + 3] == 0) continue;
		r[data[i]]++;
		g[data[i + 1]]++;
		b[data[i + 2]]++;
		l[(data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8]++;
	}
	return { r: r, g: g, b: b, l: l };
}

export function draw_histogram(ctx, counts, width, height, color) {
	var max = 0;
	//ignore extreme peaks so the shape stays readable
	var sorted = Array.from(counts).sort(function (a, b) { return b - a; });
	max = sorted[2] || sorted[0] || 1;
	ctx.fillStyle = color;
	var bar = width / 256;
	for (var i = 0; i < 256; i++) {
		var h = Math.min(1, counts[i] / max) * height;
		ctx.fillRect(i * bar, height - h, Math.ceil(bar), h);
	}
}

/**
 * monotone cubic (Fritsch-Carlson) curve through points -> 256 lookup table
 */
export function curve_lut(points) {
	var pts = points.slice().sort(function (a, b) { return a[0] - b[0]; });
	var n = pts.length;
	//float table: 16 bit images interpolate between entries, 8 bit rounds on store
	var lut = new Float32Array(256);
	if (n == 0) {
		for (var i = 0; i < 256; i++) lut[i] = i;
		return lut;
	}
	if (n == 1) {
		lut.fill(pts[0][1]);
		return lut;
	}
	var dx = [], dy = [], m = [];
	for (var i = 0; i < n - 1; i++) {
		dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
		dy[i] = pts[i + 1][1] - pts[i][1];
		m[i] = dy[i] / dx[i];
	}
	var t = [m[0]];
	for (var i = 1; i < n - 1; i++) {
		t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
	}
	t[n - 1] = m[n - 2];
	for (var i = 0; i < n - 1; i++) {
		if (m[i] == 0) {
			t[i] = 0;
			t[i + 1] = 0;
			continue;
		}
		var a = t[i] / m[i], b = t[i + 1] / m[i];
		var s = a * a + b * b;
		if (s > 9) {
			var k = 3 / Math.sqrt(s);
			t[i] = k * a * m[i];
			t[i + 1] = k * b * m[i];
		}
	}
	var seg = 0;
	for (var x = 0; x < 256; x++) {
		if (x <= pts[0][0]) {
			lut[x] = pts[0][1];
			continue;
		}
		if (x >= pts[n - 1][0]) {
			lut[x] = pts[n - 1][1];
			continue;
		}
		while (seg < n - 2 && x > pts[seg + 1][0]) seg++;
		var h = dx[seg];
		var u = (x - pts[seg][0]) / h;
		var u2 = u * u, u3 = u2 * u;
		var y = (2 * u3 - 3 * u2 + 1) * pts[seg][1] + (u3 - 2 * u2 + u) * h * t[seg]
			+ (-2 * u3 + 3 * u2) * pts[seg + 1][1] + (u3 - u2) * h * t[seg + 1];
		lut[x] = Math.min(255, Math.max(0, y));
	}
	return lut;
}

/**
 * applies per channel lookup tables, alpha unchanged
 */
export function apply_luts(src, dst, lut_r, lut_g, lut_b) {
	if (!(src instanceof Float32Array)) {
		for (var i = 0; i < src.length; i += 4) {
			dst[i] = lut_r[src[i]];
			dst[i + 1] = lut_g[src[i + 1]];
			dst[i + 2] = lut_b[src[i + 2]];
			dst[i + 3] = src[i + 3];
		}
		return;
	}
	//16 bit (float 0..255): linear interpolation between table entries
	for (var j = 0; j < src.length; j += 4) {
		dst[j] = lut_at(lut_r, src[j]);
		dst[j + 1] = lut_at(lut_g, src[j + 1]);
		dst[j + 2] = lut_at(lut_b, src[j + 2]);
		dst[j + 3] = src[j + 3];
	}
}

/**
 * table value at a fractional index (0..255)
 */
export function lut_at(lut, v) {
	if (!(v > 0)) return lut[0];
	if (v >= 255) return lut[255];
	var i = v | 0, f = v - i;
	return lut[i] + (lut[i + 1] - lut[i]) * f;
}

export function identity_lut() {
	var lut = new Float32Array(256);
	for (var i = 0; i < 256; i++) lut[i] = i;
	return lut;
}
