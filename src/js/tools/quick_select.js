import config from './../config.js';
import Selection_tool_base from './../core/selection-tool.js';
import { new_canvas, MODES } from './../core/pixel-selection.js';
import { render_all_doc } from './../core/ai-apply.js';
import { track_drag } from './../core/view-nav.js';

const WORK_PIXELS = 1500000;

/**
 * Quick Selection tool (W): paint over an area, selection grows to similar colours and stops at edges.
 * First stroke makes a new selection, next strokes add (Alt = subtract), like Photoshop.
 */
class Quick_select_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'quick_select';
		this.allow_move = false;
	}

	prepare() {
		var W = config.WIDTH, H = config.HEIGHT;
		var s = Math.min(1, Math.sqrt(WORK_PIXELS / (W * H)));
		var w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
		var c = new_canvas(w, h);
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(render_all_doc(), 0, 0, w, h);
		var d = ctx.getImageData(0, 0, w, h).data;
		var lab = new Float32Array(w * h * 3);
		var lum = new Float32Array(w * h);
		for (var i = 0, j = 0; i < w * h; i++, j += 4) {
			lab[i * 3] = d[j];
			lab[i * 3 + 1] = d[j + 1];
			lab[i * 3 + 2] = d[j + 2];
			lum[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
		}
		var edge = new Float32Array(w * h);
		for (var y = 1; y < h - 1; y++) {
			for (var x = 1; x < w - 1; x++) {
				var k = y * w + x;
				var gx = lum[k + 1 - w] + 2 * lum[k + 1] + lum[k + 1 + w] - lum[k - 1 - w] - 2 * lum[k - 1] - lum[k - 1 + w];
				var gy = lum[k + w - 1] + 2 * lum[k + w] + lum[k + w + 1] - lum[k - w - 1] - 2 * lum[k - w] - lum[k - w + 1];
				edge[k] = Math.sqrt(gx * gx + gy * gy);
			}
		}
		this.work = { w: w, h: h, s: s, rgb: lab, edge: edge, key: this.doc_key() };
	}

	doc_key() {
		return config.WIDTH + 'x' + config.HEIGHT + ':' + config.layers.map(function (l) { return l.id + (l.link && l.link._stamp || ''); }).join(',');
	}

	start(point, mode, e) {
		var _this = this;
		if (!this.work || this.work.key != this.doc_key()) this.prepare();
		var work = this.work;
		var size = Math.max(2, (this.getParams().size || 25) * work.s / 2);
		var subtract = mode == MODES[2];
		var adding = mode == MODES[1] || (mode == MODES[0] && this.Selection.has() && this.last_stroke_selection === this.Selection.mask);
		if (mode == MODES[0] && !adding) mode = MODES[0];
		else if (!subtract) mode = MODES[1];
		var mask = new Uint8Array(work.w * work.h);
		var model = [0, 0, 0, 0];
		var scale = config.ZOOM || 1;
		var current = { x: point.x, y: point.y };
		var grow = function (p) {
			var cx = Math.round(p.x * work.s), cy = Math.round(p.y * work.s);
			var r = Math.round(size);
			var seeds = [];
			for (var y = cy - r; y <= cy + r; y++) {
				for (var x = cx - r; x <= cx + r; x++) {
					if (x < 0 || y < 0 || x >= work.w || y >= work.h) continue;
					if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
					var k = y * work.w + x;
					seeds.push(k);
					model[0] += work.rgb[k * 3]; model[1] += work.rgb[k * 3 + 1]; model[2] += work.rgb[k * 3 + 2]; model[3]++;
				}
			}
			var mr = model[0] / model[3], mg = model[1] / model[3], mb = model[2] / model[3];
			var limit = 34;
			var win = r * 4;
			var x0 = Math.max(0, cx - win), x1 = Math.min(work.w - 1, cx + win);
			var y0 = Math.max(0, cy - win), y1 = Math.min(work.h - 1, cy + win);
			var queue = seeds.slice();
			for (var q = 0; q < seeds.length; q++) mask[seeds[q]] = 1;
			while (queue.length) {
				var k2 = queue.pop();
				var px = k2 % work.w, py = (k2 - px) / work.w;
				var neighbors = [k2 - 1, k2 + 1, k2 - work.w, k2 + work.w];
				for (var n = 0; n < 4; n++) {
					var nk = neighbors[n];
					var nx = n == 0 ? px - 1 : n == 1 ? px + 1 : px, ny = n == 2 ? py - 1 : n == 3 ? py + 1 : py;
					if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || mask[nk]) continue;
					if (work.edge[nk] > 140) continue;
					var dr = work.rgb[nk * 3] - mr, dg = work.rgb[nk * 3 + 1] - mg, db = work.rgb[nk * 3 + 2] - mb;
					if (Math.sqrt(dr * dr + dg * dg + db * db) > limit) continue;
					mask[nk] = 1;
					queue.push(nk);
				}
			}
			_this.show(mask, work);
		};
		grow(point);
		track_drag(e, function (dx, dy) {
			current.x += dx / scale;
			current.y += dy / scale;
			grow(current);
		}, function () {
			_this.Selection.preview_fill = null;
			var shape = _this.to_canvas(mask, work);
			_this.Selection.combine(_this.Selection.blurred(shape, 1), subtract ? MODES[2] : mode, '빠른 선택');
			setTimeout(function () { _this.last_stroke_selection = _this.Selection.mask; }, 50);
		});
	}

	to_canvas(mask, work) {
		var small = new_canvas(work.w, work.h);
		var sctx = small.getContext('2d');
		var image = sctx.createImageData(work.w, work.h);
		for (var i = 0; i < mask.length; i++) {
			if (!mask[i]) continue;
			image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = image.data[i * 4 + 3] = 255;
		}
		sctx.putImageData(image, 0, 0);
		var full = new_canvas();
		var fctx = full.getContext('2d');
		fctx.imageSmoothingQuality = 'high';
		fctx.drawImage(small, 0, 0, full.width, full.height);
		return full;
	}

	show(mask, work) {
		var now = Date.now();
		if (this.last_show && now - this.last_show < 60) return;
		this.last_show = now;
		var shape = this.to_canvas(mask, work);
		//existing selection + new area, shown as overlay while painting
		if (this.Selection.has()) shape.getContext('2d').drawImage(this.Selection.mask, 0, 0);
		this.Selection.preview_fill = shape;
		this.Selection.draw_overlay();
	}
}

export default Quick_select_class;
