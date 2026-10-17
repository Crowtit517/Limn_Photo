/*
 * Edit > Content-Aware Scale (Alt+Shift+Ctrl+C): changes the layer's width / height by removing
 * (or doubling) low-detail paths of pixels - "seams" - so people, buildings or food keep their shape
 * while sky, walls or a table take the change.
 *
 * Seams are searched on a reduced copy (fast), then the order is applied to the full resolution.
 */
import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Pixel_selection_class from './../../core/pixel-selection.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';

const WORK_SIDE = 560;
const PREVIEW_SIDE = 260;
const PROTECT_ENERGY = 20000;
const SKIN_ENERGY = 1500;

var instance = null;

function new_canvas(w, h) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

/**
 * removal order of vertical seams: rank[y * w + x] = when that pixel is removed (w - 1 = never)
 */
export function rank_seams(lum0, weight0, w, h) {
	var lum = Float32Array.from(lum0);
	var weight = weight0 ? Float32Array.from(weight0) : null;
	var idx = new Int32Array(w * h);
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) idx[y * w + x] = x;
	}
	var rank = new Int32Array(w * h).fill(w - 1);
	var E = new Float32Array(w * h);
	var M = new Float32Array(w * h);
	for (var s = 0, cw = w; cw > 1; s++, cw--) {
		//energy of the current (already carved) image: gradient size + protection
		for (var y = 0; y < h; y++) {
			var row = y * w;
			var up = y > 0 ? row - w : row, down = y < h - 1 ? row + w : row;
			for (var x = 0; x < cw; x++) {
				var l = x > 0 ? x - 1 : x, r = x < cw - 1 ? x + 1 : x;
				var e = Math.abs(lum[row + r] - lum[row + l]) + Math.abs(lum[down + x] - lum[up + x]);
				E[row + x] = weight ? e + weight[row + x] : e;
			}
		}
		//cheapest top-to-bottom path
		for (var x = 0; x < cw; x++) M[x] = E[x];
		for (var y = 1; y < h; y++) {
			var row = y * w, prev = row - w;
			for (var x = 0; x < cw; x++) {
				var m = M[prev + x];
				if (x > 0 && M[prev + x - 1] < m) m = M[prev + x - 1];
				if (x < cw - 1 && M[prev + x + 1] < m) m = M[prev + x + 1];
				M[row + x] = E[row + x] + m;
			}
		}
		var last = (h - 1) * w, best = 0;
		for (var x = 1; x < cw; x++) {
			if (M[last + x] < M[last + best]) best = x;
		}
		//walk back up, removing the seam from every row
		for (var y = h - 1; y >= 0; y--) {
			var row = y * w;
			rank[row + idx[row + best]] = s;
			for (var x = best; x < cw - 1; x++) {
				lum[row + x] = lum[row + x + 1];
				idx[row + x] = idx[row + x + 1];
				if (weight) weight[row + x] = weight[row + x + 1];
			}
			if (y > 0) {
				var prev = row - w, next = best;
				if (best > 0 && M[prev + best - 1] < M[prev + next]) next = best - 1;
				if (best < cw - 1 && M[prev + best + 1] < M[prev + next]) next = best + 1;
				best = next;
			}
		}
	}
	return rank;
}

/**
 * new width per row: drops (or doubles) the pixels removed first in the seam order
 */
function carve_rows(data, ch, W, H, rank, ws, hs, newW) {
	var out = new (data.constructor)(newW * H * ch);
	var n = Math.abs(W - newW);
	var remove = newW < W;
	var row_rank = new Int32Array(W);
	var counts = new Int32Array(ws + 1);
	var xmap = new Int32Array(W);
	for (var x = 0; x < W; x++) xmap[x] = Math.min(ws - 1, Math.floor(x * ws / W));
	for (var y = 0; y < H; y++) {
		var ys = Math.min(hs - 1, Math.floor(y * hs / H)) * ws;
		counts.fill(0);
		for (var x = 0; x < W; x++) {
			row_rank[x] = rank[ys + xmap[x]];
			counts[row_rank[x]]++;
		}
		//ranks below t are taken whole, `extra` more pixels of rank t
		var t = 0, taken = 0;
		while (t <= ws && taken + counts[t] <= n) {
			taken += counts[t];
			t++;
		}
		var extra = n - taken;
		var src = y * W * ch, o = y * newW * ch;
		for (var x = 0; x < W; x++) {
			var r = row_rank[x];
			var chosen = r < t || (r == t && extra > 0 && extra-- > 0);
			var p = src + x * ch;
			if (remove) {
				if (chosen) continue;
				for (var k = 0; k < ch; k++) out[o++] = data[p + k];
			}
			else {
				for (var k = 0; k < ch; k++) out[o++] = data[p + k];
				if (chosen) {
					var q = x < W - 1 ? p + ch : p;
					for (var k = 0; k < ch; k++) out[o++] = (data[p + k] + data[q + k]) / 2;
				}
			}
		}
	}
	return out;
}

function transpose(data, ch, w, h) {
	var out = new (data.constructor)(data.length);
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var s = (y * w + x) * ch, d = (x * h + y) * ch;
			for (var k = 0; k < ch; k++) out[d + k] = data[s + k];
		}
	}
	return out;
}

function is_skin(r, g, b) {
	//YCbCr skin range, works for most skin tones
	var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
	var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
	return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/**
 * one direction: rows get newW pixels wide
 */
function scale_width(rgba, protect, W, H, newW, skin) {
	if (newW == W) return { rgba: rgba, protect: protect };
	//reduced copy for the seam search
	var f = Math.min(1, WORK_SIDE / Math.max(W, H));
	var ws = Math.max(2, Math.round(W * f)), hs = Math.max(1, Math.round(H * f));
	var full = new_canvas(W, H);
	full.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
	var small = new_canvas(ws, hs);
	var sctx = small.getContext('2d', { willReadFrequently: true });
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage(full, 0, 0, ws, hs);
	var sd = sctx.getImageData(0, 0, ws, hs).data;
	var lum = new Float32Array(ws * hs);
	var weight = null;
	if (protect || skin) weight = new Float32Array(ws * hs);
	for (var y = 0; y < hs; y++) {
		var fy = Math.min(H - 1, Math.floor((y + 0.5) * H / hs));
		for (var x = 0; x < ws; x++) {
			var i = y * ws + x, p = i * 4;
			//transparent pixels count as flat
			var a = sd[p + 3] / 255;
			lum[i] = (sd[p] * 0.299 + sd[p + 1] * 0.587 + sd[p + 2] * 0.114) * a;
			if (weight) {
				var fx = Math.min(W - 1, Math.floor((x + 0.5) * W / ws));
				var e = 0;
				if (protect) e += protect[fy * W + fx] / 255 * PROTECT_ENERGY;
				if (skin && a > 0.5 && is_skin(sd[p], sd[p + 1], sd[p + 2])) e += SKIN_ENERGY;
				weight[i] = e;
			}
		}
	}
	var rank = rank_seams(lum, weight, ws, hs);
	return {
		rgba: carve_rows(rgba, 4, W, H, rank, ws, hs, newW),
		protect: protect ? carve_rows(protect, 1, W, H, rank, ws, hs, newW) : null,
	};
}

/**
 * content-aware resize of RGBA pixels; protect = optional alpha (0..255) per pixel
 */
export function content_aware_resize(rgba, W, H, newW, newH, protect, skin) {
	var step = scale_width(rgba, protect, W, H, newW, skin);
	var data = step.rgba;
	if (newH != H) {
		var t = transpose(data, 4, newW, H);
		var tp = step.protect ? transpose(step.protect, 1, newW, H) : null;
		var res = scale_width(t, tp, H, newW, newH, skin);
		data = transpose(res.rgba, 4, newH, newW);
	}
	return new Uint8ClampedArray(data.buffer);
}

class Edit_content_aware_scale_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
		this.dialog = new Adjust_dialog();
	}

	content_aware_scale() {
		var _this = this;
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('래스터 레이어에서만 사용할 수 있습니다. 레이어를 선택하거나 래스터화하세요.');
			return;
		}
		var W = layer.width_original || layer.link.width;
		var H = layer.height_original || layer.link.height;
		if (W < 4 || H < 4) {
			alertify.error('레이어가 너무 작습니다.');
			return;
		}
		var full = new_canvas(W, H);
		var fctx = full.getContext('2d', { willReadFrequently: true });
		fctx.drawImage(layer.link, 0, 0, W, H);
		var selection = new Pixel_selection_class();
		var has_selection = selection.has();

		//small copy for the dialog preview
		var pf = Math.min(1, PREVIEW_SIDE / Math.max(W, H));
		var pw = Math.max(4, Math.round(W * pf)), ph = Math.max(4, Math.round(H * pf));
		var pc = new_canvas(pw, ph);
		var pctx = pc.getContext('2d', { willReadFrequently: true });
		pctx.imageSmoothingQuality = 'high';
		pctx.drawImage(full, 0, 0, pw, ph);
		var preview_rgba = pctx.getImageData(0, 0, pw, ph).data;
		var preview_protect = null;
		var full_protect = null;
		var protect_of = function (w, h) {
			var mask = selection.mask_for_layer(layer);
			if (!mask) return null;
			var c = new_canvas(w, h);
			var ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(mask, 0, 0, w, h);
			var d = ctx.getImageData(0, 0, w, h).data;
			var a = new Uint8ClampedArray(w * h);
			for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
			return a;
		};

		var body = '<div class="cas_wrap">'
			+ '<div class="cas_preview"><canvas></canvas></div>'
			+ '<div class="cas_fields">'
			+ '<label class="adj_row">폭 <input type="number" data-k="w" min="10" max="200" step="1" value="100"> %</label>'
			+ '<label class="adj_row">높이 <input type="number" data-k="h" min="10" max="200" step="1" value="100"> %</label>'
			+ '<label class="adj_check"><input type="checkbox" data-k="link"> 비율 유지</label>'
			+ '<label class="adj_row">보호 <select data-k="protect"><option value="none">없음</option>'
			+ '<option value="selection"' + (has_selection ? ' selected' : '') + (has_selection ? '' : ' disabled') + '>선택 영역</option></select></label>'
			+ '<label class="adj_check"><input type="checkbox" data-k="skin"> 피부 톤 보호</label>'
			+ '<div class="cas_size"></div>'
			+ '</div></div>';

		var el = this.dialog.open({
			title: '내용 인식 비율',
			body: body,
			on_reset: function () {
				el.querySelector('[data-k=w]').value = 100;
				el.querySelector('[data-k=h]').value = 100;
				update();
			},
			on_ok: function () {
				_this.apply(layer, full, W, H, read(), has_selection ? protect_of : null);
			},
		});
		var canvas = el.querySelector('.cas_preview canvas');
		var timer = null;
		var read = function () {
			var wp = Math.max(10, Math.min(200, parseFloat(el.querySelector('[data-k=w]').value) || 100));
			var hp = Math.max(10, Math.min(200, parseFloat(el.querySelector('[data-k=h]').value) || 100));
			return {
				w: Math.max(2, Math.round(W * wp / 100)),
				h: Math.max(2, Math.round(H * hp / 100)),
				protect: el.querySelector('[data-k=protect]').value == 'selection',
				skin: el.querySelector('[data-k=skin]').checked,
			};
		};
		var draw = function () {
			var o = read();
			var nw = Math.max(2, Math.round(pw * o.w / W)), nh = Math.max(2, Math.round(ph * o.h / H));
			if (o.protect && !preview_protect) preview_protect = protect_of(pw, ph);
			var out = content_aware_resize(new Uint8ClampedArray(preview_rgba), pw, ph, nw, nh, o.protect ? preview_protect : null, o.skin);
			canvas.width = 280;
			canvas.height = 220;
			var ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			var fit = Math.min(canvas.width / Math.max(pw, nw), canvas.height / Math.max(ph, nh));
			var dw = nw * fit, dh = nh * fit;
			var tmp = new_canvas(nw, nh);
			tmp.getContext('2d').putImageData(new ImageData(out, nw, nh), 0, 0);
			//outline of the original size
			ctx.strokeStyle = 'rgba(255,255,255,0.35)';
			ctx.setLineDash([4, 3]);
			ctx.strokeRect((canvas.width - pw * fit) / 2 + 0.5, (canvas.height - ph * fit) / 2 + 0.5, pw * fit - 1, ph * fit - 1);
			ctx.drawImage(tmp, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
			el.querySelector('.cas_size').textContent = o.w + ' × ' + o.h + ' px';
		};
		var update = function () {
			clearTimeout(timer);
			timer = setTimeout(draw, 60);
		};
		el.querySelectorAll('[data-k]').forEach(function (input) {
			input.addEventListener('input', function () {
				if (el.querySelector('[data-k=link]').checked && (input.dataset.k == 'w' || input.dataset.k == 'h')) {
					var other = el.querySelector('[data-k=' + (input.dataset.k == 'w' ? 'h' : 'w') + ']');
					other.value = input.value;
				}
				update();
			});
			input.addEventListener('change', update);
		});
		draw();
	}

	async apply(layer, full, W, H, o, protect_of) {
		if (o.w == W && o.h == H) return;
		var notice = alertify.message('내용 인식 비율 적용 중...', 0);
		await new Promise(function (r) { setTimeout(r, 30); });
		try {
			var rgba = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
			var protect = o.protect && protect_of ? protect_of(W, H) : null;
			var out = content_aware_resize(rgba, W, H, o.w, o.h, protect, o.skin);
			var canvas = new_canvas(o.w, o.h);
			canvas.getContext('2d').putImageData(new ImageData(out, o.w, o.h), 0, 0);
			//layer keeps its center and its display scale
			var width = layer.width * o.w / W, height = layer.height * o.h / H;
			await app.State.do_action(new app.Actions.Bundle_action('content_aware_scale', '내용 인식 비율', [
				new app.Actions.Update_layer_image_action(canvas, layer.id),
				new app.Actions.Update_layer_action(layer.id, {
					x: Math.round(layer.x + (layer.width - width) / 2),
					y: Math.round(layer.y + (layer.height - height) / 2),
					width: width,
					height: height,
					width_original: o.w,
					height_original: o.h,
				}),
			]));
		}
		catch (e) {
			console.error(e);
			alertify.error('내용 인식 비율을 적용하지 못했습니다.');
		}
		finally {
			notice.dismiss();
		}
	}
}

export default Edit_content_aware_scale_class;
