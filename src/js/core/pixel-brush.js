/*
 * Base for retouching brushes that change layer pixels directly (dodge, burn, sponge, smudge).
 * Dabs are placed along the mouse path; each dab gets the pixels under it with a soft
 * round weight (hardness) and changes them. One undo step per stroke.
 * Selection support comes from Raster_commit (these tools are "in place" tools).
 */
import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './base-tools.js';
import { track_drag, view_xy } from './view-nav.js';
import Raster_commit_class from './raster-commit.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

export function luminance(r, g, b) {
	return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

export default class Pixel_brush_base extends Base_tools_class {

	constructor() {
		super();
		this.work = null;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			if (e.altKey) return;
			e.preventDefault();
			_this.start(e);
		});
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || _this.work) return;
			var mouse = _this.get_mouse_info(e);
			_this.show_mouse_cursor(mouse.x, mouse.y, _this.get_size(), 'circle');
		});
	}

	get_size() {
		var size = this.getParams().size;
		return Math.max(1, parseFloat(size) || 1);
	}

	start(e) {
		var _this = this;
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('래스터 레이어를 선택하세요.');
			return;
		}
		if (layer._mask_editing) {
			alertify.error('레이어 마스크가 아닌 픽셀을 선택하세요 (레이어 썸네일 클릭).');
			return;
		}
		var params = this.getParams();
		var source = layer.link_canvas != null ? layer.link_canvas : layer.link;
		var work = document.createElement('canvas');
		work.width = layer.width_original || source.width;
		work.height = layer.height_original || source.height;
		var wctx = work.getContext('2d', { willReadFrequently: true });
		wctx.drawImage(source, 0, 0);
		this.work = work;
		this.wctx = wctx;
		this.layer = layer;
		this.params = params;
		this.begin_stroke(params);

		//document -> layer image coordinates
		var sx = work.width / (layer.width || work.width), sy = work.height / (layer.height || work.height);
		var canvas = document.getElementById('canvas_minipaint');
		var rect = canvas.getBoundingClientRect();
		var to_layer = function (ev) {
			var p = window.Layers.get_world_coords(...view_xy(ev));
			return { x: (p.x - layer.x) * sx, y: (p.y - layer.y) * sy };
		};
		var size = this.get_size() * sx;
		var spacing = Math.max(1, size * this.spacing_ratio());
		var last = to_layer(e);
		this.dab(last.x, last.y, size, null);
		var carry = 0;
		layer.link_canvas = work;
		config.need_render = true;
		track_drag(e, function (dx, dy, ev) {
			var p = to_layer(ev);
			var ddx = p.x - last.x, ddy = p.y - last.y;
			var length = Math.sqrt(ddx * ddx + ddy * ddy);
			var t = spacing - carry;
			while (t <= length) {
				var f = t / length;
				_this.dab(last.x + ddx * f, last.y + ddy * f, size, { x: ddx / length, y: ddy / length });
				t += spacing;
			}
			carry = length - (t - spacing);
			last = p;
			config.need_render = true;
		}, function () {
			_this.finish();
		});
	}

	spacing_ratio() {
		return 0.2;
	}

	begin_stroke(params) {
	}

	/**
	 * weight 0..1 for distance d from dab center
	 */
	weight(d, radius, hardness) {
		if (d >= radius) return 0;
		var core = radius * hardness;
		if (d <= core) return 1;
		var t = (d - core) / (radius - core);
		return 1 - t * t * (3 - 2 * t);
	}

	dab(cx, cy, size, direction) {
		var radius = size / 2;
		var left = Math.max(0, Math.floor(cx - radius)), top = Math.max(0, Math.floor(cy - radius));
		var right = Math.min(this.work.width, Math.ceil(cx + radius)), bottom = Math.min(this.work.height, Math.ceil(cy + radius));
		var w = right - left, h = bottom - top;
		if (w <= 0 || h <= 0) return;
		var image = this.wctx.getImageData(left, top, w, h);
		var hardness = (this.params.hardness === undefined ? 50 : this.params.hardness) / 100;
		var weights = new Float32Array(w * h);
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var dx = left + x + 0.5 - cx, dy = top + y + 0.5 - cy;
				weights[y * w + x] = this.weight(Math.sqrt(dx * dx + dy * dy), radius, hardness);
			}
		}
		this.apply(image.data, weights, w, h, { left: left, top: top, cx: cx, cy: cy, radius: radius, direction: direction });
		this.wctx.putImageData(image, left, top);
	}

	/**
	 * subclasses change data (RGBA) using weights
	 */
	apply(data, weights, w, h, info) {
	}

	async finish() {
		var layer = this.layer;
		var work = this.work;
		this.work = null;
		if (!layer || !work) return;
		await app.State.do_action(new app.Actions.Bundle_action(this.name, this.history_name || this.name, [
			new app.Actions.Update_layer_image_action(work, layer.id),
		]));
		var clear = function () {
			if (layer.link_canvas === work) {
				delete layer.link_canvas;
				config.need_render = true;
			}
		};
		if (layer.link.complete) clear();
		else layer.link.addEventListener('load', clear, { once: true });
		//the drag helper swallows mouseup: let the selection restore pixels outside it now
		new Raster_commit_class().stroke_ended();
	}
}
