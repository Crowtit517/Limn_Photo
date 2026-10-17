/*
 * Pixel selection engine (Photoshop style).
 * Selection = document-sized canvas, alpha channel = how much a pixel is selected.
 * No selection = whole image is editable.
 * Selection objects (canvases) are never modified after they are set, so undo only swaps references.
 */
import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import { Base_action } from './../actions/base.js';

var instance = null;

export const MODES = ['새 선택', '선택 영역에 추가', '선택 영역에서 빼기', '선택 영역과 교차'];

export function new_canvas(width, height) {
	var canvas = document.createElement('canvas');
	canvas.width = width || config.WIDTH;
	canvas.height = height || config.HEIGHT;
	return canvas;
}

/**
 * undoable selection change, shows in history like Photoshop ("사각형 선택 윤곽", "선택 해제"...)
 */
export class Set_pixel_selection_action extends Base_action {

	constructor(new_mask, description) {
		super('pixel_selection', description || '선택');
		this.new_mask = new_mask;
		this.old_mask = null;
	}

	async do() {
		super.do();
		var engine = new Pixel_selection_class();
		this.old_mask = engine.mask;
		if (this.old_mask && !this.new_mask) {
			engine.last_mask = this.old_mask;
		}
		engine.apply(this.new_mask);
	}

	async undo() {
		super.undo();
		new Pixel_selection_class().apply(this.old_mask);
	}

	free() {
		this.old_mask = null;
		this.new_mask = null;
	}
}

class Pixel_selection_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.mask = null;
		this.last_mask = null;
		this.outline = null;
		this.bounds = null;
		this.alpha = null;
		this.preview_path = null;
		this.preview_offset = null;
		this.dash = 0;
		this.layer_masks = new WeakMap();
		this.init_overlay();
	}

	// ----------------- state -----------------

	has() {
		this.check_size();
		return this.mask != null;
	}

	/**
	 * drop selection silently when document size changes (resize, crop...)
	 */
	check_size() {
		if (this.mask && (this.mask.width != config.WIDTH || this.mask.height != config.HEIGHT)) {
			this.apply(null);
		}
	}

	apply(mask) {
		this.mask = mask || null;
		this.alpha = null;
		this.layer_masks = new WeakMap();
		this.outline = null;
		this.bounds = null;
		if (this.mask) {
			this.compute_outline();
		}
		this.draw_overlay();
	}

	set(mask, description) {
		return app.State.do_action(new Set_pixel_selection_action(mask, description));
	}

	/**
	 * alpha (0..255) per document pixel
	 */
	get_alpha() {
		if (!this.mask) return null;
		if (!this.alpha) {
			var data = this.mask.getContext('2d', { willReadFrequently: true })
				.getImageData(0, 0, this.mask.width, this.mask.height).data;
			var alpha = new Uint8ClampedArray(this.mask.width * this.mask.height);
			for (var i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j];
			this.alpha = alpha;
		}
		return this.alpha;
	}

	contains(x, y) {
		if (!this.has()) return false;
		x = Math.floor(x);
		y = Math.floor(y);
		if (x < 0 || y < 0 || x >= config.WIDTH || y >= config.HEIGHT) return false;
		return this.get_alpha()[y * config.WIDTH + x] >= 128;
	}

	/**
	 * selection mapped into layer image coordinates (for tools that edit layer pixels directly)
	 */
	mask_for_layer(layer) {
		if (!this.has() || !layer) return null;
		var cached = this.layer_masks.get(layer);
		var w = layer.width_original || layer.width, h = layer.height_original || layer.height;
		var key = [layer.x, layer.y, layer.width, layer.height, w, h].join(',');
		if (cached && cached.key == key) return cached.canvas;
		var canvas = new_canvas(w, h);
		var ctx = canvas.getContext('2d');
		ctx.scale(w / (layer.width || w), h / (layer.height || h));
		ctx.translate(-layer.x, -layer.y);
		ctx.drawImage(this.mask, 0, 0);
		this.layer_masks.set(layer, { key: key, canvas: canvas });
		return canvas;
	}

	// ----------------- building -----------------

	/**
	 * combines shape (canvas, alpha = coverage) with current selection
	 */
	combine(shape, mode, description) {
		var current = this.has() ? this.mask : null;
		var result;
		if (mode == MODES[1] && current) {
			result = this.copy(current);
			result.getContext('2d').drawImage(shape, 0, 0);
		}
		else if (mode == MODES[2]) {
			if (!current) return;
			result = this.copy(current);
			var ctx = result.getContext('2d');
			ctx.globalCompositeOperation = 'destination-out';
			ctx.drawImage(shape, 0, 0);
		}
		else if (mode == MODES[3]) {
			if (!current) return;
			result = this.copy(current);
			var ctx2 = result.getContext('2d');
			ctx2.globalCompositeOperation = 'destination-in';
			ctx2.drawImage(shape, 0, 0);
		}
		else {
			result = shape;
		}
		if (this.is_empty(result)) {
			return this.set(null, description || '선택 해제');
		}
		return this.set(result, description);
	}

	copy(canvas) {
		var result = new_canvas(canvas.width, canvas.height);
		result.getContext('2d').drawImage(canvas, 0, 0);
		return result;
	}

	is_empty(canvas) {
		var data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
		for (var i = 3; i < data.length; i += 4) {
			if (data[i] > 0) return false;
		}
		return true;
	}

	/**
	 * empty doc-size canvas to draw a selection shape on (white = selected)
	 */
	shape_canvas(feather) {
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = '#ffffff';
		return { canvas: canvas, ctx: ctx, feather: feather || 0 };
	}

	/**
	 * applies feather of the tool options to finished shape
	 */
	finish_shape(shape) {
		if (!shape.feather) return shape.canvas;
		return this.blurred(shape.canvas, shape.feather);
	}

	blurred(canvas, radius) {
		var result = new_canvas(canvas.width, canvas.height);
		var ctx = result.getContext('2d');
		ctx.filter = 'blur(' + Math.max(0.1, radius / 2) + 'px)';
		ctx.drawImage(canvas, 0, 0);
		return result;
	}

	// ----------------- commands -----------------

	select_all() {
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		return this.set(canvas, '모두 선택');
	}

	deselect() {
		if (!this.has()) return;
		return this.set(null, '선택 해제');
	}

	reselect() {
		if (!this.last_mask || this.last_mask.width != config.WIDTH || this.last_mask.height != config.HEIGHT) return;
		return this.set(this.last_mask, '다시 선택');
	}

	invert() {
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		if (this.has()) {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.drawImage(this.mask, 0, 0);
		}
		if (this.is_empty(canvas)) return this.set(null, '반전');
		return this.set(canvas, '반전');
	}

	feather(radius) {
		if (!this.has() || !(radius > 0)) return;
		return this.set(this.blurred(this.mask, radius), '페더');
	}

	/**
	 * expand (+) / contract (-) by pixels
	 */
	grow(pixels) {
		if (!this.has() || !pixels) return;
		var blurred = this.blurred(this.mask, Math.abs(pixels) * 2);
		var ctx = blurred.getContext('2d', { willReadFrequently: true });
		var image = ctx.getImageData(0, 0, blurred.width, blurred.height);
		var data = image.data;
		var limit = pixels > 0 ? 10 : 245;
		for (var i = 0; i < data.length; i += 4) {
			var on = data[i + 3] > limit;
			data[i] = data[i + 1] = data[i + 2] = 255;
			data[i + 3] = on ? 255 : 0;
		}
		ctx.putImageData(image, 0, 0);
		if (this.is_empty(blurred)) return this.set(null, '축소');
		return this.set(blurred, pixels > 0 ? '확대' : '축소');
	}

	/**
	 * selection shifted by dx, dy (moving selection outline)
	 */
	moved(dx, dy) {
		if (!this.has()) return;
		var canvas = new_canvas();
		canvas.getContext('2d').drawImage(this.mask, Math.round(dx), Math.round(dy));
		return this.set(canvas, '선택 영역 이동');
	}

	// ----------------- pixel helpers -----------------

	/**
	 * original outside selection, modified inside (all canvases same size)
	 */
	blend(original, modified, mask) {
		var inside = new_canvas(original.width, original.height);
		var ictx = inside.getContext('2d');
		ictx.drawImage(modified, 0, 0);
		ictx.globalCompositeOperation = 'destination-in';
		ictx.drawImage(mask, 0, 0);
		var out = new_canvas(original.width, original.height);
		var octx = out.getContext('2d');
		octx.drawImage(original, 0, 0);
		octx.globalCompositeOperation = 'destination-out';
		octx.drawImage(mask, 0, 0);
		octx.globalCompositeOperation = 'lighter';
		octx.drawImage(inside, 0, 0);
		return out;
	}

	/**
	 * same as blend for RGBA arrays of a layer image
	 */
	blend_arrays(src, dst, layer) {
		var mask = this.mask_for_layer(layer);
		if (!mask) return;
		var data = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height).data;
		for (var i = 0; i < dst.length; i += 4) {
			var a = data[i + 3] / 255;
			if (a == 1) continue;
			dst[i] = src[i] + (dst[i] - src[i]) * a;
			dst[i + 1] = src[i + 1] + (dst[i + 1] - src[i + 1]) * a;
			dst[i + 2] = src[i + 2] + (dst[i + 2] - src[i + 2]) * a;
			dst[i + 3] = src[i + 3] + (dst[i + 3] - src[i + 3]) * a;
		}
	}

	/**
	 * bounding box of selected pixels
	 */
	get_bounds() {
		if (!this.has()) return null;
		if (this.bounds) return this.bounds;
		var alpha = this.get_alpha();
		var w = config.WIDTH, h = config.HEIGHT;
		var min_x = w, min_y = h, max_x = -1, max_y = -1;
		for (var y = 0; y < h; y++) {
			var row = y * w;
			for (var x = 0; x < w; x++) {
				if (alpha[row + x] > 0) {
					if (x < min_x) min_x = x;
					if (x > max_x) max_x = x;
					if (y < min_y) min_y = y;
					if (y > max_y) max_y = y;
				}
			}
		}
		this.bounds = max_x < 0 ? null : { x: min_x, y: min_y, width: max_x - min_x + 1, height: max_y - min_y + 1 };
		return this.bounds;
	}

	// ----------------- marching ants -----------------

	/**
	 * pixel edge outline (alpha >= 128) as Path2D in document coordinates
	 */
	compute_outline() {
		var alpha = this.get_alpha();
		var w = this.mask.width, h = this.mask.height;
		var path = new Path2D();
		var inside = function (x, y) {
			return x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] >= 128;
		};
		//horizontal edges between rows y-1 and y
		for (var y = 0; y <= h; y++) {
			var start = -1;
			for (var x = 0; x <= w; x++) {
				var edge = x < w && inside(x, y - 1) != inside(x, y);
				if (edge && start < 0) start = x;
				if (!edge && start >= 0) {
					path.moveTo(start, y);
					path.lineTo(x, y);
					start = -1;
				}
			}
		}
		//vertical edges between columns x-1 and x
		for (var x2 = 0; x2 <= w; x2++) {
			var start2 = -1;
			for (var y2 = 0; y2 <= h; y2++) {
				var edge2 = y2 < h && inside(x2 - 1, y2) != inside(x2, y2);
				if (edge2 && start2 < 0) start2 = y2;
				if (!edge2 && start2 >= 0) {
					path.moveTo(x2, start2);
					path.lineTo(x2, y2);
					start2 = -1;
				}
			}
		}
		this.outline = path;
	}

	init_overlay() {
		var _this = this;
		setInterval(function () {
			if (_this.mask || _this.preview_path) {
				_this.dash = (_this.dash + 1) % 8;
				_this.draw_overlay();
			}
		}, 110);
	}

	get_overlay() {
		var canvas = document.getElementById('selection_overlay');
		var main = document.getElementById('canvas_minipaint');
		if (!main) return null;
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.id = 'selection_overlay';
			canvas.style.position = 'absolute';
			canvas.style.left = '0';
			canvas.style.top = '0';
			canvas.style.pointerEvents = 'none';
			canvas.style.zIndex = '3';
			main.parentNode.appendChild(canvas);
		}
		if (canvas.width != main.width || canvas.height != main.height) {
			canvas.width = main.width;
			canvas.height = main.height;
		}
		canvas.style.left = main.offsetLeft + 'px';
		canvas.style.top = main.offsetTop + 'px';
		return canvas;
	}

	/**
	 * draws ants on overlay canvas (does not re-render layers)
	 */
	draw_overlay() {
		this.check_size();
		var canvas = this.get_overlay();
		if (!canvas) return;
		var ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (this.hidden) return;
		var m = zoomView.matrix;
		//Select and Mask view: tint (overlay) or matte (black / white) outside the mask
		var view = this.preview_fill ? { mask: this.preview_fill, color: 'rgba(255,0,0,0.5)' }
			: this.preview_matte ? { mask: this.preview_matte.mask, color: this.preview_matte.mode == 'white' ? '#ffffff' : '#000000' } : null;
		if (view) {
			if (!this.tint_cache || this.tint_cache.mask !== view.mask || this.tint_cache.color !== view.color) {
				var tint = document.createElement('canvas');
				tint.width = view.mask.width;
				tint.height = view.mask.height;
				var tctx = tint.getContext('2d');
				tctx.fillStyle = view.color;
				tctx.fillRect(0, 0, tint.width, tint.height);
				tctx.globalCompositeOperation = 'destination-out';
				tctx.drawImage(view.mask, 0, 0);
				this.tint_cache = { mask: view.mask, color: view.color, canvas: tint };
			}
			ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
			ctx.drawImage(this.tint_cache.canvas, 0, 0);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			return;
		}
		if (!this.outline && !this.preview_path) return;
		var scale = m[0] || 1;
		var paths = [];
		if (this.outline) paths.push([this.outline, this.preview_offset]);
		if (this.preview_path) paths.push([this.preview_path, null]);
		for (var i = 0; i < paths.length; i++) {
			var offset = paths[i][1];
			ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + (offset ? offset.x * scale : 0), m[5] + (offset ? offset.y * scale : 0));
			ctx.lineWidth = 1 / scale;
			ctx.setLineDash([]);
			ctx.strokeStyle = '#ffffff';
			ctx.stroke(paths[i][0]);
			ctx.setLineDash([4 / scale, 4 / scale]);
			ctx.lineDashOffset = -this.dash / scale;
			ctx.strokeStyle = '#000000';
			ctx.stroke(paths[i][0]);
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}

	set_preview(path, offset) {
		this.preview_path = path || null;
		this.preview_offset = offset || null;
		this.draw_overlay();
	}
}

export default Pixel_selection_class;
