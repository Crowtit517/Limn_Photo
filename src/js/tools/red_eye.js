import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { track_drag, view_xy } from './../core/view-nav.js';

/**
 * Red Eye tool (J): click on a red pupil (or drag a box around the eye)
 */
class Red_eye_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'red_eye';
		this.box = null;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			var start = _this.to_doc(e);
			var end = { x: start.x, y: start.y };
			_this.box = { x: start.x, y: start.y, w: 0, h: 0 };
			track_drag(e, function (dx, dy, ev) {
				end = _this.to_doc(ev);
				_this.box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
				config.need_render = true;
			}, function () {
				var box = _this.box;
				_this.box = null;
				if (box.w < 4 || box.h < 4) {
					//click: search around the point
					var r = Math.max(12, Math.min(config.WIDTH, config.HEIGHT) * 0.02);
					box = { x: start.x - r, y: start.y - r, w: r * 2, h: r * 2 };
				}
				_this.fix(box);
			});
		});
	}

	to_doc(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return window.Layers.get_world_coords(...view_xy(e));
	}

	fix(box) {
		var layer = config.layer;
		if (!layer || layer.type != 'image') return;
		var params = this.getParams();
		var pupil = (params.pupil_size || 50) / 100, darken = (params.darken || 50) / 100;
		var w = layer.width_original || layer.link.width, h = layer.height_original || layer.link.height;
		var sx = w / layer.width, sy = h / layer.height;
		var x0 = Math.max(0, Math.floor((box.x - layer.x) * sx)), y0 = Math.max(0, Math.floor((box.y - layer.y) * sy));
		var x1 = Math.min(w, Math.ceil((box.x + box.w - layer.x) * sx)), y1 = Math.min(h, Math.ceil((box.y + box.h - layer.y) * sy));
		if (x1 <= x0 || y1 <= y0) return;
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var d = image.data, changed = 0;
		var cx = (x1 - x0) / 2, cy = (y1 - y0) / 2, rmax = Math.min(cx, cy) * (0.6 + pupil * 0.6);
		for (var y = 0; y < y1 - y0; y++) {
			for (var x = 0; x < x1 - x0; x++) {
				var o = (y * (x1 - x0) + x) * 4;
				var r = d[o], g = d[o + 1], b = d[o + 2];
				var redness = r - Math.max(g, b);
				if (redness < 40 || r < 80) continue;
				var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / rmax;
				var k = Math.max(0, Math.min(1, (redness - 40) / 60)) * Math.max(0, Math.min(1, 1.3 - dist));
				var target = ((g + b) / 2) * (1 - darken * 0.6);
				d[o] = r + (target - r) * k;
				d[o + 1] = g + (target - g) * k * 0.3;
				d[o + 2] = b + (target - b) * k * 0.3;
				changed++;
			}
		}
		if (!changed) return;
		ctx.putImageData(image, x0, y0);
		app.State.do_action(new app.Actions.Bundle_action('red_eye', '적목 현상 도구', [
			new app.Actions.Update_layer_image_action(canvas, layer.id),
		]));
	}

	render_overlay(ctx) {
		if (!this.box || config.TOOL.name != this.name) return;
		ctx.save();
		ctx.strokeStyle = '#ffffff';
		ctx.setLineDash([4 / config.ZOOM, 4 / config.ZOOM]);
		ctx.lineWidth = 1 / config.ZOOM;
		ctx.strokeRect(this.box.x, this.box.y, this.box.w, this.box.h);
		ctx.restore();
	}
}

export default Red_eye_class;
