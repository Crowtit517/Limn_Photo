/*
 * Shared pixel math for filters: luminance maps and fast blurs (GPU canvas blur), cached per source.
 */

var blur_cache = new WeakMap();

export function luminance_map(src, width, height) {
	var size = width * height;
	var lum = new Float32Array(size);
	for (var i = 0, j = 0; i < size; i++, j += 4) {
		lum[i] = (src[j] * 0.2126 + src[j + 1] * 0.7152 + src[j + 2] * 0.0722) / 255;
	}
	return lum;
}

/**
 * blurred copy of an RGBA array (Gaussian, radius in pixels), edges handled without darkening
 */
export function blur_rgba(src, width, height, radius) {
	var canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	var image = new ImageData(new Uint8ClampedArray(src), width, height);
	if (radius < 0.3) return image.data;
	var tmp = document.createElement('canvas');
	tmp.width = width;
	tmp.height = height;
	tmp.getContext('2d').putImageData(image, 0, 0);
	ctx.filter = 'blur(' + radius + 'px)';
	ctx.drawImage(tmp, 0, 0);
	ctx.filter = 'none';
	return ctx.getImageData(0, 0, width, height).data;
}

/**
 * blurred luminance (0..1); cached for the same source array while a dialog is open
 */
export function blurred_luminance(src, width, height, radius) {
	radius = Math.round(radius * 10) / 10;
	var cache = blur_cache.get(src);
	if (!cache) {
		cache = {};
		blur_cache.set(src, cache);
	}
	var key = width + 'x' + height + '@' + radius;
	if (cache[key]) return cache[key];
	var size = width * height;
	var gray = new Uint8ClampedArray(size * 4);
	for (var i = 0, j = 0; i < size; i++, j += 4) {
		var y = src[j] * 0.2126 + src[j + 1] * 0.7152 + src[j + 2] * 0.0722;
		gray[j] = gray[j + 1] = gray[j + 2] = y;
		gray[j + 3] = 255;
	}
	var blurred = blur_rgba(gray, width, height, radius);
	var out = new Float32Array(size);
	for (var k = 0, m = 0; k < size; k++, m += 4) out[k] = blurred[m] / 255;
	cache[key] = out;
	return out;
}

/**
 * blurred RGBA, cached per source
 */
export function blurred_rgba(src, width, height, radius) {
	radius = Math.round(radius * 10) / 10;
	var cache = blur_cache.get(src);
	if (!cache) {
		cache = {};
		blur_cache.set(src, cache);
	}
	var key = 'rgba' + width + 'x' + height + '@' + radius;
	if (!cache[key]) cache[key] = blur_rgba(src, width, height, radius);
	return cache[key];
}

export function smoothstep(a, b, x) {
	var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
}

/**
 * pixel radius that looks the same on a preview copy and on the full image
 */
export function relative_radius(width, height, fraction) {
	return Math.sqrt(width * width + height * height) * fraction;
}
