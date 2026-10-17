/*
 * Free transform (Ctrl+T), Photoshop style:
 * - drag inside = move (Shift: lock axis), drag handle = scale (corners keep proportions,
 *   Shift = free, Alt = from center), drag outside = rotate (Shift: 15° steps)
 * - Enter / double click = apply, Esc = cancel, arrows = nudge
 * - with a selection only selected pixels are transformed (and the selection with them)
 */
import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Pixel_selection_class, { new_canvas, Set_pixel_selection_action } from './../core/pixel-selection.js';
import { render_layer_doc } from './../core/ai-apply.js';
import { track_drag, set_cursor, view_xy } from './../core/view-nav.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { draw_quad, draw_mapped, smooth_grid_map, square_to_quad } from './../libs/mesh-warp.js';
import { render_smart } from './../core/smart-object.js';
import { make_surface } from './../core/layer-surface.js';

const HANDLES = [
	[-1, -1], [0, -1], [1, -1],
	[1, 0], [1, 1], [0, 1],
	[-1, 1], [-1, 0],
];
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
const ROTATE_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
	'<path d="M4 11a6 6 0 1 0 2-5" fill="none" stroke="#fff" stroke-width="3.5"/>' +
	'<path d="M4 11a6 6 0 1 0 2-5" fill="none" stroke="#000" stroke-width="1.5"/>' +
	'<path d="M2.5 2.5l5 1-3 4z" fill="#000" stroke="#fff" stroke-width="1"/></svg>') + '") 10 10, crosshair';

/**
 * smallest box containing pixels with alpha > 0
 */
function alpha_bounds(canvas) {
	var w = canvas.width, h = canvas.height;
	if (!w || !h) return null;
	var data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
	var min_x = w, min_y = h, max_x = -1, max_y = -1;
	for (var y = 0; y < h; y++) {
		var row = y * w * 4;
		for (var x = 0; x < w; x++) {
			if (data[row + x * 4 + 3] > 0) {
				if (x < min_x) min_x = x;
				if (x > max_x) max_x = x;
				if (y < min_y) min_y = y;
				if (y > max_y) max_y = y;
			}
		}
	}
	return max_x < 0 ? null : { x: min_x, y: min_y, width: max_x - min_x + 1, height: max_y - min_y + 1 };
}

function crop(canvas, box) {
	var out = new_canvas(box.width, box.height);
	out.getContext('2d').drawImage(canvas, -box.x, -box.y);
	return out;
}

function point_in_polygon(p, poly) {
	var inside = false;
	for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		var a = poly[i], b = poly[j];
		if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
	}
	return inside;
}

function rotate_vec(x, y, angle) {
	var c = Math.cos(angle), s = Math.sin(angle);
	return { x: x * c - y * s, y: x * s + y * c };
}

class Transform_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'transform';
		this.session = null;
		this.prev_tool = null;
		this.keep_ratio = false;
		this.Selection = new Pixel_selection_class();
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || !_this.session || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.on_down(e);
		});
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || !_this.session || _this.dragging) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			set_cursor(_this.cursor_for(_this.hit(_this.get_point(e))));
		});
		document.addEventListener('dblclick', function (e) {
			if (config.TOOL.name != _this.name || !_this.session) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			if (_this.hit(_this.get_point(e)).type == 'move') {
				_this.finish(true);
			}
		});
	}

	get_point(e) {
		var canvas = document.getElementById('canvas_minipaint');
		var rect = canvas.getBoundingClientRect();
		var world = app.Layers.get_world_coords(...view_xy(e));
		return { x: world.x, y: world.y };
	}

	// ----------------- session -----------------

	/**
	 * starts free transform on active layer (or selected pixels of it)
	 */
	start(activate) {
		if (this.session) return true;
		var layer = config.layer;
		if (!layer || layer.type == null) {
			alertify.error('레이어가 비어 있어 변형할 수 없습니다.');
			return false;
		}
		if (layer.type != 'image') {
			alertify.error('먼저 레이어를 래스터화하세요 (레이어 > 래스터화).');
			return false;
		}
		if (!layer.link || !(layer.link.width || layer.link.naturalWidth)) {
			alertify.error('이미지를 불러오는 중입니다. 잠시 후 다시 시도하세요.');
			return false;
		}

		//layer pixels in layer space (rotated layers are baked to document space)
		var base, base_x, base_y;
		if (layer.rotate) {
			base = render_layer_doc(layer);
			base_x = 0;
			base_y = 0;
		}
		else {
			base = new_canvas(Math.max(1, Math.round(layer.width)), Math.max(1, Math.round(layer.height)));
			base.getContext('2d').drawImage(layer.link, 0, 0, base.width, base.height);
			base_x = layer.x;
			base_y = layer.y;
		}

		var piece = base, rest = null, sel_mask = null;
		if (this.Selection.has()) {
			sel_mask = this.Selection.mask;
			piece = new_canvas(base.width, base.height);
			var pctx = piece.getContext('2d');
			pctx.drawImage(base, 0, 0);
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(sel_mask, -base_x, -base_y);
			rest = new_canvas(base.width, base.height);
			var rctx = rest.getContext('2d');
			rctx.drawImage(base, 0, 0);
			rctx.globalCompositeOperation = 'destination-out';
			rctx.drawImage(sel_mask, -base_x, -base_y);
		}
		var bounds = alpha_bounds(piece);
		var smart_src = null;
		if (layer.smart && !sel_mask && !layer.rotate && bounds) {
			var sb = new_canvas(base.width, base.height);
			sb.getContext('2d').drawImage(layer.smart.source, 0, 0, base.width, base.height);
			smart_src = crop(sb, bounds);
		}
		if (!bounds) {
			alertify.error(sel_mask ? '선택 영역에 픽셀이 없습니다.' : '레이어에 픽셀이 없습니다.');
			return false;
		}
		var bx = base_x + bounds.x, by = base_y + bounds.y;
		var s = {
			layer: layer,
			rest: rest,
			base_x: base_x,
			base_y: base_y,
			src: crop(piece, bounds),
			src_mask: sel_mask ? crop(sel_mask, { x: bx, y: by, width: bounds.width, height: bounds.height }) : null,
			smart_src: smart_src,
			w0: bounds.width,
			h0: bounds.height,
			cx: bx + bounds.width / 2,
			cy: by + bounds.height / 2,
			sx: 1,
			sy: 1,
			angle: 0,
		};
		s.start = { cx: s.cx, cy: s.cy };
		this.session = s;
		var _this = this;
		layer._ft = { draw: function (ctx) { _this.draw_content(ctx, s); } };
		this.Selection.hidden = true;
		this.Selection.draw_overlay();

		if (activate === false) {
			config.need_render = true;
			return true;
		}
		this.prev_tool = config.TOOL.name == this.name ? (this.prev_tool || 'select') : config.TOOL.name;
		if (config.TOOL.name != this.name) {
			app.GUI.GUI_tools.activate_tool(this.name);
		}
		else {
			this.render_options();
		}
		config.need_render = true;
		return true;
	}

	is_identity(s) {
		if (s.quad || s.grid) return false;
		return s.sx == 1 && s.sy == 1 && Math.abs(s.angle) < 1e-9
			&& Math.abs(s.cx - s.start.cx) < 1e-6 && Math.abs(s.cy - s.start.cy) < 1e-6;
	}

	/**
	 * apply = true: bake result into layer, false: restore
	 */
	async finish(apply, switch_back) {
		var s = this.session;
		if (!s) return;
		this.session = null;
		var layer = s.layer;
		this.Selection.hidden = false;

		if (!apply || this.is_identity(s)) {
			delete layer._ft;
			this.Selection.draw_overlay();
			config.need_render = true;
			this.leave_tool(switch_back);
			return;
		}

		var corners = this.corners(s);
		var min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
		var boxes = corners.slice();
		if (s.rest) {
			boxes.push({ x: s.base_x, y: s.base_y }, { x: s.base_x + s.rest.width, y: s.base_y + s.rest.height });
		}
		for (var i = 0; i < boxes.length; i++) {
			min_x = Math.min(min_x, boxes[i].x);
			min_y = Math.min(min_y, boxes[i].y);
			max_x = Math.max(max_x, boxes[i].x);
			max_y = Math.max(max_y, boxes[i].y);
		}
		min_x = Math.floor(min_x);
		min_y = Math.floor(min_y);
		var width = Math.max(1, Math.ceil(max_x) - min_x);
		var height = Math.max(1, Math.ceil(max_y) - min_y);

		var result = new_canvas(width, height);
		var ctx = result.getContext('2d');
		ctx.translate(-min_x, -min_y);
		this.draw_content(ctx, s);

		var smart_source = null;
		if (layer.smart && s.smart_src) {
			//smart object: transform the original pixels, then re-apply smart filters
			var src_result = new_canvas(width, height);
			var sctx = src_result.getContext('2d');
			sctx.translate(-min_x, -min_y);
			this.draw_content(sctx, Object.assign({}, s, { src: s.smart_src, rest: null }));
			smart_source = make_surface(src_result);
			result = render_smart(Object.assign({}, layer.smart, { source: smart_source }));
		}
		var actions = [
			new app.Actions.Update_layer_image_action(result, layer.id),
			new app.Actions.Update_layer_action(layer.id, {
				x: min_x, y: min_y, width: width, height: height,
				width_original: width, height_original: height, rotate: 0,
			}),
		];
		if (smart_source) {
			actions.push(new app.Actions.Update_layer_action(layer.id, { smart: Object.assign({}, layer.smart, { source: smart_source }) }));
		}
		if (s.src_mask) {
			var mask = new_canvas();
			var mctx = mask.getContext('2d');
			this.draw_piece(mctx, s, s.src_mask);
			actions.push(new Set_pixel_selection_action(mask, '자유 변형'));
		}

		//keep showing result until new image is decoded
		delete layer._ft;
		layer.link_canvas = result;
		await app.State.do_action(new app.Actions.Bundle_action('free_transform', '자유 변형', actions));
		var clear = function () {
			if (layer.link_canvas === result) {
				delete layer.link_canvas;
				config.need_render = true;
			}
		};
		if (layer.link.complete) clear();
		else layer.link.addEventListener('load', clear, { once: true });
		config.need_render = true;
		this.leave_tool(switch_back);
	}

	leave_tool(switch_back) {
		if (switch_back === false) return;
		var prev = this.prev_tool || 'select';
		this.prev_tool = null;
		if (config.TOOL.name == this.name) {
			app.GUI.GUI_tools.activate_tool(prev);
		}
	}

	on_leave() {
		//switching tools applies the transform (like Photoshop "Apply")
		if (this.session) {
			this.finish(true, false);
		}
	}

	on_activate() {
		if (!this.session && !this.start()) {
			//nothing to transform - go back
			var _this = this;
			setTimeout(function () { _this.leave_tool(true); }, 0);
			return;
		}
		this.render_options();
	}

	// ----------------- geometry -----------------

	apply_matrix(ctx, s) {
		ctx.translate(s.cx, s.cy);
		ctx.rotate(s.angle);
		ctx.scale(s.sx, s.sy);
	}

	draw_content(ctx, s) {
		ctx.save();
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		if (s.rest) {
			ctx.drawImage(s.rest, s.base_x, s.base_y);
		}
		this.draw_piece(ctx, s, s.src);
		ctx.restore();
	}

	/**
	 * transformed pixels: affine, perspective quad, or warp grid
	 */
	draw_piece(ctx, s, img) {
		if (s.grid) {
			draw_mapped(ctx, img, s.w0, s.h0, smooth_grid_map(s.grid), 28);
			return;
		}
		if (s.quad) {
			draw_quad(ctx, img, s.w0, s.h0, s.quad);
			return;
		}
		ctx.save();
		this.apply_matrix(ctx, s);
		ctx.drawImage(img, -s.w0 / 2, -s.h0 / 2);
		ctx.restore();
	}

	/**
	 * image corners [TL, TR, BR, BL] of the affine state (flips included)
	 */
	image_quad(s) {
		var w = s.w0 / 2 * s.sx, h = s.h0 / 2 * s.sy;
		return [this.to_world(s, -w, -h), this.to_world(s, w, -h), this.to_world(s, w, h), this.to_world(s, -w, h)];
	}

	handle_points(s) {
		if (s.grid) {
			var pts = [];
			for (var j = 0; j < s.grid.length; j++) {
				for (var i = 0; i < s.grid.length; i++) pts.push({ x: s.grid[j][i].x, y: s.grid[j][i].y, gi: i, gj: j });
			}
			return pts;
		}
		if (s.quad) {
			var q = s.quad;
			var mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
			var list = [[q[0], -1, -1], [mid(q[0], q[1]), 0, -1], [q[1], 1, -1], [mid(q[1], q[2]), 1, 0],
				[q[2], 1, 1], [mid(q[2], q[3]), 0, 1], [q[3], -1, 1], [mid(q[3], q[0]), -1, 0]];
			return list.map(function (l) { return { x: l[0].x, y: l[0].y, hx: l[1], hy: l[2] }; });
		}
		var size = this.size(s);
		var _this = this;
		return HANDLES.map(function (h) {
			var p = _this.to_world(s, h[0] * size.w / 2, h[1] * size.h / 2);
			return { x: p.x, y: p.y, hx: h[0], hy: h[1] };
		});
	}

	size(s) {
		return { w: Math.abs(s.w0 * s.sx), h: Math.abs(s.h0 * s.sy) };
	}

	to_world(s, lx, ly) {
		var v = rotate_vec(lx, ly, s.angle);
		return { x: s.cx + v.x, y: s.cy + v.y };
	}

	to_local(s, p) {
		return rotate_vec(p.x - s.cx, p.y - s.cy, -s.angle);
	}

	corners(s) {
		if (s.quad) return s.quad.map(function (p) { return { x: p.x, y: p.y }; });
		if (s.grid) {
			var g = s.grid, m = g.length - 1, all = [];
			g.forEach(function (row) { row.forEach(function (p) { all.push(p); }); });
			return all;
		}
		var size = this.size(s);
		var w = size.w / 2, h = size.h / 2;
		return [
			this.to_world(s, -w, -h), this.to_world(s, w, -h),
			this.to_world(s, w, h), this.to_world(s, -w, h),
		];
	}

	hit(p) {
		var s = this.session;
		if (!s) return { type: 'none' };
		var size = this.size(s);
		var zoom = config.ZOOM || 1;
		var radius = 7 / zoom;
		var handles = this.handle_points(s);
		for (var i = 0; i < handles.length; i++) {
			var hp = handles[i];
			if (Math.abs(p.x - hp.x) <= radius && Math.abs(p.y - hp.y) <= radius) {
				if (s.grid) return { type: 'grid', gi: hp.gi, gj: hp.gj };
				return { type: 'scale', hx: hp.hx, hy: hp.hy };
			}
		}
		if (s.quad || s.grid) {
			return point_in_polygon(p, s.quad || this.grid_outline(s)) ? { type: 'move' } : { type: 'rotate' };
		}
		var q = this.to_local(s, p);
		if (Math.abs(q.x) <= size.w / 2 && Math.abs(q.y) <= size.h / 2) {
			return { type: 'move' };
		}
		return { type: 'rotate' };
	}

	grid_outline(s) {
		var g = s.grid, m = g.length - 1, out = [];
		for (var i = 0; i <= m; i++) out.push(g[0][i]);
		for (var j = 1; j <= m; j++) out.push(g[j][m]);
		for (var k = m - 1; k >= 0; k--) out.push(g[m][k]);
		for (var l = m - 1; l > 0; l--) out.push(g[l][0]);
		return out;
	}

	cursor_for(hit) {
		if (hit.type == 'grid') return 'crosshair';
		if (hit.type == 'move') return 'move';
		if (hit.type == 'rotate') return ROTATE_CURSOR;
		if (hit.type == 'scale') {
			var dir = Math.atan2(hit.hy, hit.hx) + this.session.angle;
			var step = Math.round(dir / (Math.PI / 4));
			return RESIZE_CURSORS[((step % 4) + 4) % 4];
		}
		return 'default';
	}

	// ----------------- mouse -----------------

	on_down(e) {
		var _this = this;
		var s = this.session;
		var hit = this.hit(this.get_point(e));
		var m0 = this.get_point(e);
		var st = { cx: s.cx, cy: s.cy, sx: s.sx, sy: s.sy, angle: s.angle };
		var size0 = this.size(s);
		this.dragging = true;
		set_cursor(this.cursor_for(hit));
		//Ctrl + handle, Edit > Transform modes, or an already distorted box: corner based editing
		if (s.grid || s.quad || (hit.type == 'scale' && (e.ctrlKey || e.metaKey)) || (s.mode && s.mode != 'free' && hit.type == 'scale')) {
			this.drag_points(e, s, hit, m0);
			return;
		}

		track_drag(e, function (dx, dy, ev) {
			var m = _this.get_point(ev);
			if (hit.type == 'move') {
				var mx = m.x - m0.x, my = m.y - m0.y;
				if (ev.shiftKey) {
					if (Math.abs(mx) > Math.abs(my)) my = 0;
					else mx = 0;
				}
				s.cx = st.cx + mx;
				s.cy = st.cy + my;
			}
			else if (hit.type == 'rotate') {
				var a0 = Math.atan2(m0.y - st.cy, m0.x - st.cx);
				var a1 = Math.atan2(m.y - st.cy, m.x - st.cx);
				var angle = st.angle + a1 - a0;
				if (ev.shiftKey) {
					var snap = Math.PI / 12;
					angle = Math.round(angle / snap) * snap;
				}
				s.angle = angle;
			}
			else if (hit.type == 'scale') {
				_this.drag_scale(s, st, size0, hit, m, ev);
			}
			_this.sync_options();
			config.need_render = true;
		}, function () {
			_this.dragging = false;
			_this.sync_options();
			config.need_render = true;
		});
	}

	/**
	 * distort / skew / perspective (quad) and warp (grid) editing
	 */
	drag_points(e, s, hit, m0) {
		var _this = this;
		if (!s.quad && !s.grid) s.quad = this.image_quad(s);
		var points = s.grid ? [].concat.apply([], s.grid) : s.quad;
		var start = points.map(function (p) { return { x: p.x, y: p.y }; });
		var centroid = start.reduce(function (a, p) { return { x: a.x + p.x / start.length, y: a.y + p.y / start.length }; }, { x: 0, y: 0 });
		var corner_index = { '-1,-1': 0, '1,-1': 1, '1,1': 2, '-1,1': 3 };
		var edges = { '0,-1': [0, 1], '1,0': [1, 2], '0,1': [2, 3], '-1,0': [3, 0] };
		track_drag(e, function (dx, dy, ev) {
			var m = _this.get_point(ev);
			var ddx = m.x - m0.x, ddy = m.y - m0.y;
			var set = function (i, x, y) { points[i].x = x; points[i].y = y; };
			if (hit.type == 'move') {
				start.forEach(function (p, i) { set(i, p.x + ddx, p.y + ddy); });
			}
			else if (hit.type == 'rotate') {
				var a = Math.atan2(m.y - centroid.y, m.x - centroid.x) - Math.atan2(m0.y - centroid.y, m0.x - centroid.x);
				var c = Math.cos(a), sn = Math.sin(a);
				start.forEach(function (p, i) {
					var x = p.x - centroid.x, y = p.y - centroid.y;
					set(i, centroid.x + x * c - y * sn, centroid.y + x * sn + y * c);
				});
			}
			else if (hit.type == 'grid') {
				var gi = hit.gj * s.grid.length + hit.gi;
				set(gi, start[gi].x + ddx, start[gi].y + ddy);
			}
			else if (hit.type == 'scale') {
				var key = hit.hx + ',' + hit.hy;
				var perspective = s.mode == 'perspective' || ((ev.ctrlKey || ev.metaKey) && ev.altKey && ev.shiftKey);
				var skew = s.mode == 'skew' || ((ev.ctrlKey || ev.metaKey) && !perspective);
				if (corner_index[key] != null) {
					var idx = corner_index[key];
					if (perspective) {
						//corner and its partner on the same horizontal edge move symmetrically
						var partner = { 0: 1, 1: 0, 2: 3, 3: 2 }[idx];
						set(idx, start[idx].x + ddx, start[idx].y);
						set(partner, start[partner].x - ddx, start[partner].y);
					}
					else {
						set(idx, start[idx].x + ddx, start[idx].y + ddy);
					}
				}
				else {
					var pair = edges[key];
					var ex = start[pair[1]].x - start[pair[0]].x, ey = start[pair[1]].y - start[pair[0]].y;
					var len = Math.sqrt(ex * ex + ey * ey) || 1;
					var along = skew ? (ddx * ex + ddy * ey) / len : 0;
					var mx = skew ? ex / len * along : ddx, my = skew ? ey / len * along : ddy;
					pair.forEach(function (i) { set(i, start[i].x + mx, start[i].y + my); });
				}
			}
			config.need_render = true;
		}, function () {
			_this.dragging = false;
			config.need_render = true;
		});
	}

	/**
	 * Edit > Transform > Warp: 4x4 grid over the transformed box
	 */
	start_warp() {
		var s = this.session;
		if (!s) return;
		var quad = s.quad || this.image_quad(s);
		var map = square_to_quad(quad);
		var n = 3, grid = [];
		for (var j = 0; j <= n; j++) {
			grid.push([]);
			for (var i = 0; i <= n; i++) grid[j].push(map(i / n, j / n));
		}
		s.grid = grid;
		s.quad = null;
		config.need_render = true;
	}

	drag_scale(s, st, size0, hit, m, ev) {
		var q = rotate_vec(m.x - st.cx, m.y - st.cy, -st.angle);
		var W = size0.w, H = size0.h;
		var center = ev.altKey;
		var ax = center ? 0 : -hit.hx * W / 2;
		var ay = center ? 0 : -hit.hy * H / 2;
		var nw = W, nh = H;
		if (hit.hx) nw = center ? 2 * q.x * hit.hx : (q.x - ax) * hit.hx;
		if (hit.hy) nh = center ? 2 * q.y * hit.hy : (q.y - ay) * hit.hy;

		var corner = hit.hx != 0 && hit.hy != 0;
		//Photoshop (2019+): corners keep proportions, Shift = free; ratio button forces it everywhere
		var proportional = this.keep_ratio ? !ev.shiftKey : (corner ? !ev.shiftKey : ev.shiftKey);
		if (proportional) {
			var kx = nw / W, ky = nh / H, k;
			if (!hit.hx) k = ky;
			else if (!hit.hy) k = kx;
			else k = Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky;
			nw = W * k;
			nh = H * k;
		}
		var lx = hit.hx ? (center ? 0 : ax + hit.hx * nw / 2) : 0;
		var ly = hit.hy ? (center ? 0 : ay + hit.hy * nh / 2) : 0;
		var c = rotate_vec(lx, ly, st.angle);
		s.cx = st.cx + c.x;
		s.cy = st.cy + c.y;
		var sign_x = nw < 0 ? -1 : 1, sign_y = nh < 0 ? -1 : 1;
		s.sx = (st.sx < 0 ? -1 : 1) * sign_x * Math.max(1, Math.abs(nw)) / s.w0;
		s.sy = (st.sy < 0 ? -1 : 1) * sign_y * Math.max(1, Math.abs(nh)) / s.h0;
	}

	// ----------------- keys -----------------

	/**
	 * called by shortcuts while transforming, returns true if handled
	 */
	on_key(e) {
		if (!this.session) return false;
		var key = e.key;
		var ctrl = e.ctrlKey || e.metaKey;
		if (key == 'Enter') {
			this.finish(true);
			return true;
		}
		if (key == 'Escape' || (ctrl && key.toLowerCase() == 'z')) {
			this.finish(false);
			return true;
		}
		if (ctrl && key.toLowerCase() == 't') {
			return true;
		}
		var step = e.shiftKey ? 10 : 1;
		var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
		if (moves[key]) {
			this.session.cx += moves[key][0];
			this.session.cy += moves[key][1];
			this.sync_options();
			config.need_render = true;
			return true;
		}
		return false;
	}

	// ----------------- commands -----------------

	flip(horizontal) {
		var s = this.session;
		if (horizontal) s.sx = -s.sx;
		else s.sy = -s.sy;
	}

	rotate_by(degrees) {
		this.session.angle += degrees * Math.PI / 180;
	}

	/**
	 * Edit > Transform commands: work inside free transform, or apply at once
	 */
	command(fn) {
		var running = !!this.session;
		if (!running && !this.start(false)) return;
		fn(this.session);
		this.sync_options();
		config.need_render = true;
		if (!running) {
			this.finish(true, false);
		}
	}

	// ----------------- overlay & options bar -----------------

	render_overlay(ctx) {
		var s = this.session;
		if (!s || config.TOOL.name != this.name) return;
		var zoom = config.ZOOM || 1;
		var c = this.corners(s);
		ctx.save();
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.lineWidth = 1 / zoom;
		ctx.strokeStyle = '#1e8fff';
		if (!s.grid) {
			ctx.beginPath();
			ctx.moveTo(c[0].x, c[0].y);
			for (var i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
			ctx.closePath();
			ctx.stroke();
		}

		var half = 4 / zoom;
		ctx.fillStyle = '#ffffff';
		if (s.grid) {
			//warp grid lines
			var g = s.grid;
			ctx.beginPath();
			for (var gj = 0; gj < g.length; gj++) {
				ctx.moveTo(g[gj][0].x, g[gj][0].y);
				for (var gi = 1; gi < g.length; gi++) ctx.lineTo(g[gj][gi].x, g[gj][gi].y);
			}
			for (var gi2 = 0; gi2 < g.length; gi2++) {
				ctx.moveTo(g[0][gi2].x, g[0][gi2].y);
				for (var gj2 = 1; gj2 < g.length; gj2++) ctx.lineTo(g[gj2][gi2].x, g[gj2][gi2].y);
			}
			ctx.stroke();
		}
		this.handle_points(s).forEach(function (p) {
			ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
			ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
		});
		//reference point
		ctx.beginPath();
		ctx.arc(s.cx, s.cy, 3.5 / zoom, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	render_options() {
		var _this = this;
		var box = document.getElementById('action_attributes');
		if (!box || !this.session) return;
		box.innerHTML = '';
		var wrap = document.createElement('div');
		wrap.className = 'ft_options';
		wrap.innerHTML =
			'<label>X: <input type="number" data-k="x" step="1"></label>' +
			'<label>Y: <input type="number" data-k="y" step="1"></label>' +
			'<label>W: <input type="number" data-k="w" step="0.1">%</label>' +
			'<button type="button" class="ft_link" title="종횡비 유지">&#128279;</button>' +
			'<label>H: <input type="number" data-k="h" step="0.1">%</label>' +
			'<label>&#8736; <input type="number" data-k="a" step="0.1">°</label>' +
			'<span class="ft_sep"></span>' +
			'<button type="button" data-cmd="flip_h" title="가로로 뒤집기">&#8596;</button>' +
			'<button type="button" data-cmd="flip_v" title="세로로 뒤집기">&#8597;</button>' +
			'<button type="button" data-cmd="ccw" title="90° 시계 반대 방향 회전">&#10226;</button>' +
			'<button type="button" data-cmd="cw" title="90° 시계 방향 회전">&#10227;</button>' +
			'<span class="ft_sep"></span>' +
			'<button type="button" class="ft_cancel" title="변형 취소 (Esc)">&#10005;</button>' +
			'<button type="button" class="ft_apply" title="변형 적용 (Enter)">&#10003;</button>';
		box.appendChild(wrap);

		wrap.querySelectorAll('input').forEach(function (input) {
			input.addEventListener('change', function () {
				_this.set_value(input.dataset.k, parseFloat(input.value));
			});
			input.addEventListener('keydown', function (e) {
				if (e.key == 'Enter') {
					e.stopPropagation();
					_this.set_value(input.dataset.k, parseFloat(input.value));
				}
			});
		});
		var link = wrap.querySelector('.ft_link');
		link.classList.toggle('active', this.keep_ratio);
		link.addEventListener('click', function () {
			_this.keep_ratio = !_this.keep_ratio;
			link.classList.toggle('active', _this.keep_ratio);
		});
		wrap.querySelectorAll('[data-cmd]').forEach(function (button) {
			button.addEventListener('click', function () {
				var cmd = button.dataset.cmd;
				_this.command(function () {
					if (cmd == 'flip_h') _this.flip(true);
					if (cmd == 'flip_v') _this.flip(false);
					if (cmd == 'cw') _this.rotate_by(90);
					if (cmd == 'ccw') _this.rotate_by(-90);
				});
			});
		});
		wrap.querySelector('.ft_cancel').addEventListener('click', function () { _this.finish(false); });
		wrap.querySelector('.ft_apply').addEventListener('click', function () { _this.finish(true); });
		this.sync_options();
	}

	set_value(key, value) {
		var s = this.session;
		if (!s || isNaN(value) || s.quad || s.grid) return;
		if (key == 'x') s.cx = value;
		if (key == 'y') s.cy = value;
		if (key == 'w' || key == 'h') {
			var k = Math.max(0.1, Math.abs(value)) / 100;
			if (key == 'w' || this.keep_ratio) s.sx = (s.sx < 0 ? -1 : 1) * k;
			if (key == 'h' || this.keep_ratio) s.sy = (s.sy < 0 ? -1 : 1) * k;
		}
		if (key == 'a') s.angle = value * Math.PI / 180;
		this.sync_options();
		config.need_render = true;
	}

	sync_options() {
		var s = this.session;
		var box = document.querySelector('#action_attributes .ft_options');
		if (!s || !box) return;
		var degrees = s.angle * 180 / Math.PI;
		degrees = ((degrees + 180) % 360 + 360) % 360 - 180;
		var values = {
			x: Math.round(s.cx * 10) / 10,
			y: Math.round(s.cy * 10) / 10,
			w: Math.round(Math.abs(s.sx) * 1000) / 10,
			h: Math.round(Math.abs(s.sy) * 1000) / 10,
			a: Math.round(degrees * 10) / 10,
		};
		box.querySelectorAll('input').forEach(function (input) {
			if (document.activeElement !== input) input.value = values[input.dataset.k];
		});
	}
}

export default Transform_class;
