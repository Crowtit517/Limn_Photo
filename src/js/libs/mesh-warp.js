/*
 * Drawing an image through a non-affine mapping (perspective quad, warp grid):
 * the image is cut into small triangles, each drawn with its own affine transform.
 */

/**
 * homography from unit square (0..1) to quad [TL, TR, BR, BL] (Heckbert)
 */
export function square_to_quad(q) {
	var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
	var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
	var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
	var a, b, c, d, e, f, g, h;
	if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
		a = x1 - x0; b = x3 - x0; c = x0;
		d = y1 - y0; e = y3 - y0; f = y0;
		g = 0; h = 0;
	}
	else {
		var den = dx1 * dy2 - dx2 * dy1;
		g = (dx3 * dy2 - dx2 * dy3) / den;
		h = (dx1 * dy3 - dx3 * dy1) / den;
		a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
		d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
	}
	return function (u, v) {
		var w = g * u + h * v + 1;
		return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
	};
}

function triangle(ctx, img, s0, s1, s2, d0, d1, d2) {
	//expand destination triangle a little to hide seams
	var cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
	var grow = function (p) {
		var dx = p.x - cx, dy = p.y - cy, len = Math.sqrt(dx * dx + dy * dy) || 1;
		return { x: p.x + dx / len * 0.6, y: p.y + dy / len * 0.6 };
	};
	var e0 = grow(d0), e1 = grow(d1), e2 = grow(d2);
	var den = (s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y);
	if (Math.abs(den) < 1e-9) return;
	var m11 = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / den;
	var m12 = (s1.y * d2.y + s0.y * (d1.y - d2.y) - s2.y * d1.y + (s2.y - s1.y) * d0.y) / den;
	var m21 = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / den;
	var m22 = -(s1.x * d2.y + s0.x * (d1.y - d2.y) - s2.x * d1.y + (s2.x - s1.x) * d0.y) / den;
	var dx = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / den;
	var dy = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / den;
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(e0.x, e0.y);
	ctx.lineTo(e1.x, e1.y);
	ctx.lineTo(e2.x, e2.y);
	ctx.closePath();
	ctx.clip();
	ctx.transform(m11, m12, m21, m22, dx, dy);
	ctx.drawImage(img, 0, 0);
	ctx.restore();
}

/**
 * draws img (w x h) so that image point (u*w, v*h) lands on map(u, v)
 */
export function draw_mapped(ctx, img, w, h, map, steps) {
	var n = steps || 20;
	var pts = [];
	for (var j = 0; j <= n; j++) {
		pts.push([]);
		for (var i = 0; i <= n; i++) pts[j].push(map(i / n, j / n));
	}
	for (var y = 0; y < n; y++) {
		for (var x = 0; x < n; x++) {
			var s00 = { x: x / n * w, y: y / n * h }, s10 = { x: (x + 1) / n * w, y: y / n * h };
			var s01 = { x: x / n * w, y: (y + 1) / n * h }, s11 = { x: (x + 1) / n * w, y: (y + 1) / n * h };
			triangle(ctx, img, s00, s10, s11, pts[y][x], pts[y][x + 1], pts[y + 1][x + 1]);
			triangle(ctx, img, s00, s11, s01, pts[y][x], pts[y + 1][x + 1], pts[y + 1][x]);
		}
	}
}

export function draw_quad(ctx, img, w, h, quad) {
	draw_mapped(ctx, img, w, h, square_to_quad(quad), 24);
}

/**
 * bilinear point of a (m+1) x (m+1) control grid
 */
export function grid_map(grid) {
	var m = grid.length - 1;
	return function (u, v) {
		var gx = Math.min(m - 1e-6, u * m), gy = Math.min(m - 1e-6, v * m);
		var i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
		var a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
		return {
			x: (a.x * (1 - fx) + b.x * fx) * (1 - fy) + (c.x * (1 - fx) + d.x * fx) * fy,
			y: (a.y * (1 - fx) + b.y * fx) * (1 - fy) + (c.y * (1 - fx) + d.y * fx) * fy,
		};
	};
}

/**
 * smooth (Catmull-Rom) version of a control grid map, for Warp
 */
export function smooth_grid_map(grid) {
	var m = grid.length - 1;
	var at = function (j, i) {
		j = Math.max(0, Math.min(m, j));
		i = Math.max(0, Math.min(m, i));
		return grid[j][i];
	};
	var cr = function (p0, p1, p2, p3, t) {
		var t2 = t * t, t3 = t2 * t;
		return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
	};
	return function (u, v) {
		var gx = Math.min(m - 1e-6, u * m), gy = Math.min(m - 1e-6, v * m);
		var i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
		var rows = [];
		for (var r = -1; r <= 2; r++) {
			var p0 = at(j + r, i - 1), p1 = at(j + r, i), p2 = at(j + r, i + 1), p3 = at(j + r, i + 2);
			rows.push({ x: cr(p0.x, p1.x, p2.x, p3.x, fx), y: cr(p0.y, p1.y, p2.y, p3.y, fx) });
		}
		return { x: cr(rows[0].x, rows[1].x, rows[2].x, rows[3].x, fy), y: cr(rows[0].y, rows[1].y, rows[2].y, rows[3].y, fy) };
	};
}

/**
 * inverse mapping for perspective crop: output pixel (u,v in 0..1) -> source point inside quad
 */
export function quad_sampler(quad) {
	return square_to_quad(quad);
}
