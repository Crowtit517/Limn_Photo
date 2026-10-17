import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { track_drag, view_xy } from './../core/view-nav.js';
import { commit_paths, path2d } from './../core/gui/doc-panels.js';

/**
 * Pen tool (P), Photoshop style: click = corner point, click + drag = smooth point,
 * click the first point = close, Enter / Esc = finish. Paths go to the Paths panel.
 */
class Pen_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'pen';
		this.points = null;
		this.hover = null;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.on_down(e);
		});
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || !_this.points) return;
			_this.hover = _this.to_doc(e);
			config.need_render = true;
		});
		document.addEventListener('keydown', function (e) {
			if (config.TOOL.name != _this.name || !_this.points) return;
			if (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA')) return;
			if (e.key == 'Enter' || e.key == 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.finish(false);
			}
			else if (e.key == 'Backspace' || e.key == 'Delete') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.points.pop();
				if (!_this.points.length) _this.points = null;
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
		var zoom = config.ZOOM || 1;
		if (this.points && this.points.length > 2) {
			var first = this.points[0];
			if (Math.abs(first.x - p.x) < 8 / zoom && Math.abs(first.y - p.y) < 8 / zoom) {
				this.finish(true);
				return;
			}
		}
		if (!this.points) this.points = [];
		var point = { x: p.x, y: p.y, in: null, out: null };
		this.points.push(point);
		config.need_render = true;
		//drag = symmetric handles (smooth point)
		track_drag(e, function (dx, dy, ev) {
			var m = _this.to_doc(ev);
			point.out = { x: m.x, y: m.y };
			point.in = { x: 2 * point.x - m.x, y: 2 * point.y - m.y };
			config.need_render = true;
		});
	}

	finish(closed) {
		var points = this.points;
		this.points = null;
		this.hover = null;
		config.need_render = true;
		if (!points || points.length < 2) return;
		var list = (config.PATHS || []).slice();
		list.push({ name: '패스 ' + (list.length + 1), points: points, closed: closed });
		commit_paths(list, list.length - 1, '패스 만들기');
	}

	render_overlay(ctx) {
		if (config.TOOL.name != this.name) return;
		var zoom = config.ZOOM || 1;
		ctx.save();
		ctx.lineWidth = 1.5 / zoom;
		ctx.strokeStyle = '#1e8fff';
		if (this.points && this.points.length) {
			var preview = this.points.slice();
			if (this.hover) preview = preview.concat([{ x: this.hover.x, y: this.hover.y }]);
			ctx.stroke(path2d({ points: preview, closed: false }));
			var half = 3.5 / zoom;
			this.points.forEach(function (p) {
				ctx.fillStyle = '#fff';
				ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
				ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
				if (p.out) {
					ctx.beginPath();
					ctx.moveTo(p.in.x, p.in.y);
					ctx.lineTo(p.out.x, p.out.y);
					ctx.stroke();
				}
			});
		}
		ctx.restore();
	}
}

export default Pen_class;
