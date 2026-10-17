import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { track_drag, view_xy } from './../core/view-nav.js';
import { commit_paths } from './../core/gui/doc-panels.js';
import { shape_doc_points, build_path, normalize } from './vector_shape.js';

/**
 * Direct Selection tool (A), Photoshop style: drag anchor points or their handles of the selected
 * shape layer (or of the selected path in the Paths panel). Alt+click an anchor = corner <-> smooth.
 */
class Direct_select_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'direct_select';
		this.active = null; //{ index, part }
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.on_down(e);
		});
	}

	to_doc(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return window.Layers.get_world_coords(...view_xy(e));
	}

	/**
	 * what is edited: the selected shape layer, else the selected path
	 */
	target() {
		var layer = config.layer;
		if (layer && layer.type == 'vector_shape' && layer.params && layer.params.points) {
			return { kind: 'layer', layer: layer, points: shape_doc_points(layer), closed: layer.params.closed, rotate: layer.rotate || 0,
				cx: layer.x + layer.width / 2, cy: layer.y + layer.height / 2 };
		}
		var path = (config.PATHS || [])[config.PATH_SELECTED];
		if (path) {
			return { kind: 'path', path: path, points: JSON.parse(JSON.stringify(path.points)), closed: path.closed, rotate: 0, cx: 0, cy: 0 };
		}
		return null;
	}

	//rotated shape layers: mouse into the unrotated frame
	unrotate(t, p) {
		if (!t.rotate) return p;
		var a = -t.rotate * Math.PI / 180, dx = p.x - t.cx, dy = p.y - t.cy;
		return { x: t.cx + dx * Math.cos(a) - dy * Math.sin(a), y: t.cy + dx * Math.sin(a) + dy * Math.cos(a) };
	}

	hit(t, p) {
		var tolerance = 7 / (config.ZOOM || 1);
		var best = null, best_d = tolerance;
		t.points.forEach(function (q, i) {
			[['anchor', q], ['in', q.in], ['out', q.out]].forEach(function (item) {
				if (!item[1]) return;
				var d = Math.hypot(item[1].x - p.x, item[1].y - p.y);
				if (d <= best_d) {
					best_d = d;
					best = { index: i, part: item[0] };
				}
			});
		});
		return best;
	}

	on_down(e) {
		var _this = this;
		var t = this.target();
		if (!t) return;
		if (t.kind == 'layer') {
			var l = t.layer;
			t.orig = { x: l.x, y: l.y, width: l.width, height: l.height, params: l.params };
		}
		var p = this.unrotate(t, this.to_doc(e));
		var hit = this.hit(t, p);
		this.active = hit;
		config.need_render = true;
		if (!hit) return;
		var point = t.points[hit.index];
		if (e.altKey && hit.part == 'anchor') {
			//corner <-> smooth
			if (point.in || point.out) {
				point.in = null;
				point.out = null;
			}
			else {
				var prev = t.points[(hit.index - 1 + t.points.length) % t.points.length];
				var next = t.points[(hit.index + 1) % t.points.length];
				var vx = (next.x - prev.x) / 6, vy = (next.y - prev.y) / 6;
				point.in = { x: point.x - vx, y: point.y - vy };
				point.out = { x: point.x + vx, y: point.y + vy };
			}
			this.commit(t, '고정점 변환');
			return;
		}
		var start = p;
		var original = JSON.parse(JSON.stringify(t.points));
		var moved = false;
		track_drag(e, function (dx, dy, ev) {
			var m = _this.unrotate(t, _this.to_doc(ev));
			var ox = m.x - start.x, oy = m.y - start.y;
			var o = original[hit.index], q = t.points[hit.index];
			moved = true;
			if (hit.part == 'anchor') {
				q.x = o.x + ox;
				q.y = o.y + oy;
				q.in = o.in ? { x: o.in.x + ox, y: o.in.y + oy } : null;
				q.out = o.out ? { x: o.out.x + ox, y: o.out.y + oy } : null;
			}
			else {
				var own = hit.part, other = own == 'in' ? 'out' : 'in';
				q[own] = { x: o[own].x + ox, y: o[own].y + oy };
				//smooth point: the opposite handle stays in line (Alt breaks it, like Photoshop)
				if (o[other] && !ev.altKey) {
					var len = Math.hypot(o[other].x - o.x, o[other].y - o.y);
					var vx = q[own].x - q.x, vy = q[own].y - q.y, l = Math.hypot(vx, vy) || 1;
					q[other] = { x: q.x - vx / l * len, y: q.y - vy / l * len };
				}
			}
			_this.preview(t);
		}, function () {
			if (moved) _this.commit(t, '고정점 이동');
		});
	}

	/**
	 * live preview while dragging (not in history)
	 */
	preview(t) {
		if (t.kind == 'layer') {
			var box = normalize(t.points);
			Object.assign(t.layer, { x: box.x, y: box.y, width: box.width, height: box.height });
			t.layer.params = Object.assign({}, t.layer.params, { points: box.points });
		}
		else {
			t.preview_points = t.points;
		}
		this.live = t;
		config.need_render = true;
	}

	commit(t, description) {
		this.live = null;
		if (t.kind == 'path') {
			var list = (config.PATHS || []).slice();
			list[config.PATH_SELECTED] = Object.assign({}, t.path, { points: t.points });
			commit_paths(list, config.PATH_SELECTED, description);
			return;
		}
		var layer = t.layer;
		//restore the state before the drag so undo goes back to it
		if (t.orig) Object.assign(layer, t.orig);
		var box = normalize(t.points);
		var params = Object.assign({}, layer.params, { points: box.points });
		var action = new app.Actions.Update_layer_action(layer.id, { params: params, x: box.x, y: box.y, width: box.width, height: box.height });
		action.action_description = description;
		app.State.do_action(action);
	}

	render_overlay(ctx) {
		if (config.TOOL.name != this.name) return;
		var t = this.target();
		if (!t) return;
		if (this.live && this.live.kind == 'path') t.points = this.live.points;
		var zoom = config.ZOOM || 1;
		var active = this.active;
		ctx.save();
		if (t.rotate) {
			ctx.translate(t.cx, t.cy);
			ctx.rotate(t.rotate * Math.PI / 180);
			ctx.translate(-t.cx, -t.cy);
		}
		ctx.lineWidth = 1.2 / zoom;
		ctx.strokeStyle = '#1e8fff';
		ctx.stroke(build_path(t.points, t.closed));
		var half = 3.5 / zoom;
		t.points.forEach(function (p, i) {
			var selected = active && active.index == i;
			[p.in, p.out].forEach(function (h) {
				if (!h) return;
				ctx.beginPath();
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(h.x, h.y);
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(h.x, h.y, half * 0.8, 0, Math.PI * 2);
				ctx.fillStyle = '#1e8fff';
				ctx.fill();
			});
			ctx.fillStyle = selected ? '#1e8fff' : '#fff';
			ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
			ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
		});
		ctx.restore();
	}
}

export default Direct_select_class;
