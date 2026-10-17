import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { track_drag, view_xy } from './../core/view-nav.js';
import { square_to_quad } from './../libs/mesh-warp.js';
import { render_layer_doc } from './../core/ai-apply.js';

/**
 * Perspective Crop tool (C): drag a box, move its corners onto a tilted shape (building, document),
 * Enter = straighten and crop to it, Esc = cancel
 */
class Perspective_crop_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'perspective_crop';
		this.quad = null;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.on_down(e);
		});
		document.addEventListener('keydown', function (e) {
			if (config.TOOL.name != _this.name || !_this.quad) return;
			if (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA')) return;
			if (e.key == 'Enter') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.apply();
			}
			else if (e.key == 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.quad = null;
				config.need_render = true;
			}
		}, true);
	}

	to_doc(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return window.Layers.get_world_coords(...view_xy(e));
	}

	on_down(e) {
		var _this = this;
		var p = this.to_doc(e);
		var radius = 9 / (config.ZOOM || 1);
		if (this.quad) {
			var hit = this.quad.findIndex(function (q) { return Math.abs(q.x - p.x) < radius && Math.abs(q.y - p.y) < radius; });
			var start = this.quad.map(function (q) { return { x: q.x, y: q.y }; });
			track_drag(e, function (dx, dy, ev) {
				var m = _this.to_doc(ev);
				if (hit >= 0) {
					_this.quad[hit] = { x: m.x, y: m.y };
				}
				else {
					for (var i = 0; i < 4; i++) _this.quad[i] = { x: start[i].x + m.x - p.x, y: start[i].y + m.y - p.y };
				}
				config.need_render = true;
			});
			return;
		}
		track_drag(e, function (dx, dy, ev) {
			var m = _this.to_doc(ev);
			_this.quad = [{ x: p.x, y: p.y }, { x: m.x, y: p.y }, { x: m.x, y: m.y }, { x: p.x, y: m.y }];
			config.need_render = true;
		}, function () {
			if (_this.quad && Math.abs(_this.quad[2].x - p.x) < 4) _this.quad = null;
			config.need_render = true;
		});
	}

	async apply() {
		var q = this.quad;
		this.quad = null;
		var dist = function (a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); };
		var w = Math.round((dist(q[0], q[1]) + dist(q[3], q[2])) / 2);
		var h = Math.round((dist(q[0], q[3]) + dist(q[1], q[2])) / 2);
		if (w < 2 || h < 2) return;
		var map = square_to_quad(q);
		var W = config.WIDTH, H = config.HEIGHT;
		var actions = [];
		config.layers.forEach(function (layer) {
			if (layer.type != 'image' || !layer.link) return;
			var src = render_layer_doc(layer).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
			var out = document.createElement('canvas');
			out.width = w;
			out.height = h;
			var octx = out.getContext('2d');
			var image = octx.createImageData(w, h);
			var d = image.data;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var s = map((x + 0.5) / w, (y + 0.5) / h);
					var sx = Math.max(0, Math.min(W - 1.001, s.x - 0.5)), sy = Math.max(0, Math.min(H - 1.001, s.y - 0.5));
					var x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
					var a = (y0 * W + x0) * 4, b = a + 4, c = a + W * 4, e = c + 4, o = (y * w + x) * 4;
					for (var k = 0; k < 4; k++) {
						var top = src[a + k] + (src[b + k] - src[a + k]) * fx;
						var bottom = src[c + k] + (src[e + k] - src[c + k]) * fx;
						d[o + k] = top + (bottom - top) * fy;
					}
				}
			}
			octx.putImageData(image, 0, 0);
			actions.push(new app.Actions.Update_layer_image_action(out, layer.id));
			actions.push(new app.Actions.Update_layer_action(layer.id, { x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0 }));
		});
		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: w, HEIGHT: h }),
			new app.Actions.Prepare_canvas_action('do')
		);
		await app.State.do_action(new app.Actions.Bundle_action('perspective_crop', '원근 자르기', actions));
	}

	render_overlay(ctx) {
		var q = this.quad;
		if (!q || config.TOOL.name != this.name) return;
		var zoom = config.ZOOM || 1;
		ctx.save();
		//dim outside
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.beginPath();
		ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
		ctx.moveTo(q[0].x, q[0].y);
		ctx.lineTo(q[3].x, q[3].y);
		ctx.lineTo(q[2].x, q[2].y);
		ctx.lineTo(q[1].x, q[1].y);
		ctx.closePath();
		ctx.fill('evenodd');
		//grid
		var map = square_to_quad(q);
		ctx.strokeStyle = 'rgba(255,255,255,0.7)';
		ctx.lineWidth = 1 / zoom;
		ctx.beginPath();
		for (var i = 0; i <= 3; i++) {
			var a = map(i / 3, 0), b = map(i / 3, 1), c = map(0, i / 3), d = map(1, i / 3);
			ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
			ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
		}
		ctx.stroke();
		ctx.fillStyle = '#fff';
		var half = 4 / zoom;
		q.forEach(function (p) { ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2); });
		ctx.restore();
	}
}

export default Perspective_crop_class;
