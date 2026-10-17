/*
 * Layer styles (Photoshop "fx"): drop shadow, inner shadow, outer glow, inner glow, bevel,
 * stroke, colour overlay, gradient overlay. Result is cached per layer until pixels / styles change.
 */
import config from './../config.js';
import { pixel_stamp } from './../core/layer-surface.js';

export const STYLE_DEFAULTS = {
	drop_shadow: { enabled: false, color: '#000000', opacity: 75, angle: 120, distance: 10, size: 10 },
	inner_shadow: { enabled: false, color: '#000000', opacity: 75, angle: 120, distance: 5, size: 5 },
	outer_glow: { enabled: false, color: '#ffffbe', opacity: 75, size: 10 },
	inner_glow: { enabled: false, color: '#ffffbe', opacity: 75, size: 10 },
	bevel: { enabled: false, depth: 100, size: 5, angle: 120, highlight: '#ffffff', shadow: '#000000' },
	stroke: { enabled: false, color: '#000000', size: 3, position: 'outside', opacity: 100 },
	color_overlay: { enabled: false, color: '#ff0000', opacity: 100 },
	gradient_overlay: { enabled: false, color1: '#000000', color2: '#ffffff', angle: 90, opacity: 100 },
};

export const STYLE_NAMES = {
	bevel: '경사와 엠보스', stroke: '획', inner_shadow: '내부 그림자', inner_glow: '내부 광선',
	color_overlay: '색상 오버레이', gradient_overlay: '그레이디언트 오버레이', outer_glow: '외부 광선', drop_shadow: '드롭 섀도',
};

export function has_styles(layer) {
	if (!layer || !layer.styles || layer.type == 'adjustment' || layer.type == 'group' || layer.type == null) return false;
	for (var k in layer.styles) if (layer.styles[k] && layer.styles[k].enabled) return true;
	return false;
}

var cache = new Map();

function doc_canvas() {
	var c = document.createElement('canvas');
	c.width = config.WIDTH;
	c.height = config.HEIGHT;
	return c;
}

function colored(source, color) {
	var c = doc_canvas();
	var ctx = c.getContext('2d');
	ctx.drawImage(source, 0, 0);
	ctx.globalCompositeOperation = 'source-in';
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, c.width, c.height);
	return c;
}

/**
 * outside of the shape, filled with colour (for inner effects)
 */
function inverted(source, color) {
	var c = doc_canvas();
	var ctx = c.getContext('2d');
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(source, 0, 0);
	return c;
}

/**
 * shape grown by radius (drawn around in a circle)
 */
function dilated(silhouette, radius) {
	var c = doc_canvas();
	var ctx = c.getContext('2d');
	if (radius <= 0) {
		ctx.drawImage(silhouette, 0, 0);
		return c;
	}
	var rings = Math.max(1, Math.ceil(radius / 3));
	for (var r = 1; r <= rings; r++) {
		var dist = radius * r / rings;
		var steps = Math.max(12, Math.ceil(dist * 2));
		for (var i = 0; i < steps; i++) {
			var a = i / steps * Math.PI * 2;
			ctx.drawImage(silhouette, Math.cos(a) * dist, Math.sin(a) * dist);
		}
	}
	ctx.drawImage(silhouette, 0, 0);
	return c;
}

function light_offset(angle, distance) {
	var rad = angle * Math.PI / 180;
	return { x: -Math.cos(rad) * distance, y: Math.sin(rad) * distance };
}

function blurred(source, radius) {
	var c = doc_canvas();
	var ctx = c.getContext('2d');
	if (radius > 0) ctx.filter = 'blur(' + radius + 'px)';
	ctx.drawImage(source, 0, 0);
	ctx.filter = 'none';
	return c;
}

/**
 * document sized canvas with effects + layer content (fill opacity applied), without layer opacity
 */
export function render_styled(base_layers, layer) {
	var s = layer.styles;
	var key = [config.WIDTH, config.HEIGHT, pixel_stamp(layer), layer.x, layer.y, layer.width, layer.height, layer.rotate,
		layer.fill_opacity, layer.visible, layer._mask ? (layer._mask.enabled === false ? 'm0' : 'm') : '',
		JSON.stringify(layer.params), layer.data && typeof layer.data != 'object' ? String(layer.data).length : '',
		JSON.stringify(s)].join('|');
	var hit = cache.get(layer.id);
	if (hit && hit.key == key) return hit.canvas;

	//layer content alone
	var content = doc_canvas();
	base_layers.render_object(content.getContext('2d'), Object.assign({}, layer, { styles: null, opacity: 100, composition: 'source-over' }));
	var out = doc_canvas();
	var octx = out.getContext('2d');
	var fill = (layer.fill_opacity == null ? 100 : layer.fill_opacity) / 100;

	//behind the content
	if (s.drop_shadow && s.drop_shadow.enabled) {
		var d = s.drop_shadow, off = light_offset(d.angle, d.distance);
		octx.globalAlpha = d.opacity / 100;
		octx.filter = d.size > 0 ? 'blur(' + d.size / 2 + 'px)' : 'none';
		octx.drawImage(colored(content, d.color), off.x, off.y);
		octx.filter = 'none';
	}
	if (s.outer_glow && s.outer_glow.enabled) {
		var g = s.outer_glow;
		octx.globalAlpha = g.opacity / 100;
		var glow = blurred(dilated(colored(content, g.color), g.size / 3), g.size / 2);
		octx.drawImage(glow, 0, 0);
		octx.drawImage(glow, 0, 0);
	}

	//"layer knocks out drop shadow": nothing of the shadow / glow shows through the shape itself
	octx.globalAlpha = 1;
	octx.globalCompositeOperation = 'destination-out';
	octx.drawImage(content, 0, 0);
	octx.globalCompositeOperation = 'source-over';
	if (s.stroke && s.stroke.enabled && s.stroke.position != 'inside') {
		//stroke ring was knocked out too where it overlaps: draw it again
		var st_again = s.stroke;
		var radius_again = st_again.position == 'center' ? st_again.size / 2 : st_again.size;
		var ring_again = dilated(colored(content, st_again.color), radius_again);
		var ring_ctx = ring_again.getContext('2d');
		ring_ctx.globalCompositeOperation = 'destination-out';
		ring_ctx.drawImage(content, 0, 0);
		octx.globalAlpha = st_again.opacity / 100;
		octx.drawImage(ring_again, 0, 0);
	}

	//content and effects inside it
	var inner = doc_canvas();
	var ictx = inner.getContext('2d');
	ictx.globalAlpha = fill;
	ictx.drawImage(content, 0, 0);
	ictx.globalAlpha = 1;
	ictx.globalCompositeOperation = 'source-atop';
	if (s.gradient_overlay && s.gradient_overlay.enabled) {
		var go = s.gradient_overlay, rad = go.angle * Math.PI / 180;
		var cx = config.WIDTH / 2, cy = config.HEIGHT / 2, len = Math.max(config.WIDTH, config.HEIGHT) / 2;
		var grad = ictx.createLinearGradient(cx - Math.cos(rad) * len, cy + Math.sin(rad) * len, cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
		grad.addColorStop(0, go.color1);
		grad.addColorStop(1, go.color2);
		ictx.globalAlpha = go.opacity / 100;
		ictx.fillStyle = grad;
		ictx.fillRect(0, 0, inner.width, inner.height);
	}
	if (s.color_overlay && s.color_overlay.enabled) {
		ictx.globalAlpha = s.color_overlay.opacity / 100;
		ictx.fillStyle = s.color_overlay.color;
		ictx.fillRect(0, 0, inner.width, inner.height);
	}
	if (s.inner_glow && s.inner_glow.enabled) {
		var ig = s.inner_glow;
		ictx.globalAlpha = ig.opacity / 100;
		ictx.drawImage(blurred(inverted(content, ig.color), ig.size / 2), 0, 0);
	}
	if (s.inner_shadow && s.inner_shadow.enabled) {
		var is = s.inner_shadow, ioff = light_offset(is.angle, is.distance);
		ictx.globalAlpha = is.opacity / 100;
		ictx.filter = is.size > 0 ? 'blur(' + is.size / 2 + 'px)' : 'none';
		ictx.drawImage(inverted(content, is.color), ioff.x, ioff.y);
		ictx.filter = 'none';
	}
	if (s.bevel && s.bevel.enabled) {
		var bv = s.bevel, boff = light_offset(bv.angle, Math.max(1, bv.size / 2));
		var depth = Math.min(1, bv.depth / 100);
		var edge = blurred(inverted(content, '#000000'), bv.size / 2);
		ictx.globalAlpha = 0.75 * depth;
		ictx.drawImage(colored(edge, bv.shadow), -boff.x, -boff.y);
		ictx.drawImage(colored(edge, bv.highlight), boff.x, boff.y);
	}
	if (s.stroke && s.stroke.enabled && s.stroke.position != 'outside') {
		var st2 = s.stroke;
		var r2 = st2.position == 'center' ? st2.size / 2 : st2.size;
		ictx.globalAlpha = st2.opacity / 100;
		ictx.drawImage(dilated(inverted(content, st2.color), r2), 0, 0);
	}
	octx.globalAlpha = 1;
	octx.drawImage(inner, 0, 0);

	cache.set(layer.id, { key: key, canvas: out });
	return out;
}
