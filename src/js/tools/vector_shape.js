import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/*
 * Vector shape layer (Photoshop shape layer): a bezier path with live fill / stroke.
 * Points are stored normalized to the layer box (0..1), so moving, free transform and resize keep working.
 * params: { points: [{ x, y, in, out }], closed, fill, fill_color, border, border_color, border_size }
 */

const KAPPA = 0.5523;

function map_point(layer, p) {
	return { x: layer.x + p.x * layer.width, y: layer.y + p.y * layer.height };
}

/**
 * points of a shape layer in document coordinates (rotation not applied)
 */
export function shape_doc_points(layer) {
	return (layer.params.points || []).map(function (p) {
		return {
			x: layer.x + p.x * layer.width,
			y: layer.y + p.y * layer.height,
			in: p.in ? map_point(layer, p.in) : null,
			out: p.out ? map_point(layer, p.out) : null,
		};
	});
}

export function build_path(points, closed) {
	var path = new Path2D();
	if (!points.length) return path;
	path.moveTo(points[0].x, points[0].y);
	var seg = function (a, b) {
		var c1 = a.out || a, c2 = b.in || b;
		path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
	};
	for (var i = 1; i < points.length; i++) seg(points[i - 1], points[i]);
	if (closed) {
		seg(points[points.length - 1], points[0]);
		path.closePath();
	}
	return path;
}

/**
 * document points -> layer box + normalized points
 */
export function normalize(points) {
	var xs = [], ys = [];
	points.forEach(function (p) {
		[p, p.in, p.out].forEach(function (q) {
			if (q) {
				xs.push(q.x);
				ys.push(q.y);
			}
		});
	});
	var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
	var w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y);
	var n = function (q) { return q ? { x: (q.x - x) / w, y: (q.y - y) / h } : null; };
	return {
		x: x, y: y, width: w, height: h,
		points: points.map(function (p) {
			var r = n(p);
			r.in = n(p.in);
			r.out = n(p.out);
			return r;
		}),
	};
}

/**
 * makes a new shape layer from document points (Photoshop: pen tool in Shape mode / New Fill Layer from path)
 */
export function insert_shape_layer(points, closed, name, style) {
	var box = normalize(points);
	var params = Object.assign({
		points: box.points,
		closed: closed,
		fill: closed,
		fill_color: config.COLOR || '#000000',
		border: !closed,
		border_color: config.COLOR || '#000000',
		border_size: 3,
	}, style || {});
	return app.State.do_action(new app.Actions.Bundle_action('new_shape_layer', '모양 레이어', [
		new app.Actions.Insert_layer_action({
			type: 'vector_shape',
			name: name || '모양',
			x: box.x, y: box.y, width: box.width, height: box.height,
			rotate: 0,
			is_vector: true,
			params: params,
			render_function: ['vector_shape', 'render'],
			color: params.fill_color,
		}),
	]));
}

/**
 * rectangle / ellipse layers as editable points
 */
export function points_of_layer(layer) {
	var x = layer.x, y = layer.y, w = layer.width, h = layer.height;
	if (layer.type == 'ellipse') {
		var cx = x + w / 2, cy = y + h / 2, kx = w / 2 * KAPPA, ky = h / 2 * KAPPA;
		return [
			{ x: cx, y: y, in: { x: cx - kx, y: y }, out: { x: cx + kx, y: y } },
			{ x: x + w, y: cy, in: { x: x + w, y: cy - ky }, out: { x: x + w, y: cy + ky } },
			{ x: cx, y: y + h, in: { x: cx + kx, y: y + h }, out: { x: cx - kx, y: y + h } },
			{ x: x, y: cy, in: { x: x, y: cy + ky }, out: { x: x, y: cy - ky } },
		];
	}
	var r = Math.min(parseFloat(layer.params && layer.params.radius) || 0, w / 2, h / 2);
	if (r > 0) {
		var k = r * (1 - KAPPA);
		return [
			{ x: x + r, y: y, in: { x: x + k, y: y }, out: null },
			{ x: x + w - r, y: y, in: null, out: { x: x + w - k, y: y } },
			{ x: x + w, y: y + r, in: { x: x + w, y: y + k }, out: null },
			{ x: x + w, y: y + h - r, in: null, out: { x: x + w, y: y + h - k } },
			{ x: x + w - r, y: y + h, in: { x: x + w - k, y: y + h }, out: null },
			{ x: x + r, y: y + h, in: null, out: { x: x + k, y: y + h } },
			{ x: x, y: y + h - r, in: { x: x, y: y + h - k }, out: null },
			{ x: x, y: y + r, in: null, out: { x: x, y: y + k } },
		];
	}
	return [
		{ x: x, y: y, in: null, out: null },
		{ x: x + w, y: y, in: null, out: null },
		{ x: x + w, y: y + h, in: null, out: null },
		{ x: x, y: y + h, in: null, out: null },
	];
}

/**
 * Layer > Convert to editable shape: rectangle / ellipse -> point-editable shape layer
 */
export function convert_to_shape(layer) {
	layer = layer || config.layer;
	if (!layer || ['rectangle', 'ellipse'].indexOf(layer.type) < 0) {
		alertify.error('사각형 또는 타원 레이어를 선택하세요.');
		return;
	}
	var p = layer.params || {};
	var box = normalize(points_of_layer(layer));
	var params = {
		points: box.points, closed: true,
		fill: p.fill !== false, fill_color: p.fill_color || layer.color || '#000000',
		border: !!p.border, border_color: p.border_color || '#000000', border_size: p.border_size || 3,
	};
	return app.State.do_action(new app.Actions.Bundle_action('convert_shape', '모양 레이어로 변환', [
		new app.Actions.Update_layer_action(layer.id, {
			type: 'vector_shape', params: params, render_function: ['vector_shape', 'render'],
			x: box.x, y: box.y, width: box.width, height: box.height,
		}),
	]));
}

class Vector_shape_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'vector_shape';
	}

	render(ctx, layer) {
		var params = layer.params || {};
		if (!params.points || !params.points.length) return;
		ctx.save();
		if (layer.rotate) {
			var cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
			ctx.translate(cx, cy);
			ctx.rotate(layer.rotate * Math.PI / 180);
			ctx.translate(-cx, -cy);
		}
		var path = build_path(shape_doc_points(layer), params.closed);
		if (params.fill && params.closed) {
			ctx.fillStyle = params.fill_color;
			ctx.fill(path);
		}
		if (params.border && params.border_size > 0) {
			ctx.strokeStyle = params.border_color;
			ctx.lineWidth = params.border_size;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.stroke(path);
		}
		ctx.restore();
	}
}

export default Vector_shape_class;
