import { Live_preview, Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, set_slider, val } from './adjust.js';
import { blurred_luminance, smoothstep, relative_radius } from './../../libs/image-math.js';
import Actions_recorder_class from './../../core/actions-recorder.js';

// [id, label, min, max, default, step]
const GROUPS = [
	['화이트 밸런스', [
		['temp', '색온도', -100, 100, 0],
		['tint', '색조', -100, 100, 0],
	]],
	['톤', [
		['exposure', '노출', -5, 5, 0, 0.05],
		['contrast', '대비', -100, 100, 0],
		['highlights', '밝은 영역', -100, 100, 0],
		['shadows', '어두운 영역', -100, 100, 0],
		['whites', '흰색 계열', -100, 100, 0],
		['blacks', '검정 계열', -100, 100, 0],
	]],
	['외관', [
		['texture', '텍스처', -100, 100, 0],
		['clarity', '부분 대비', -100, 100, 0],
		['dehaze', '디헤이즈', -100, 100, 0],
		['vibrance', '생동감', -100, 100, 0],
		['saturation', '채도', -100, 100, 0],
	]],
	['세부', [
		['sharpen', '선명하게 하기', 0, 150, 0],
		['noise', '노이즈 감소', 0, 100, 0],
	]],
	['효과', [
		['vignette', '비네팅', -100, 100, 0],
		['grain', '그레인', 0, 100, 0],
	]],
];

export function default_raw_params() {
	var params = {};
	GROUPS.forEach(function (group) {
		group[1].forEach(function (item) { params[item[0]] = item[4]; });
	});
	return params;
}

function is_identity(p) {
	for (var k in p) if (p[k] != 0) return false;
	return true;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16 - 0.5; });

/**
 * sRGB -> linear for fractional (16 bit) values
 */
function lin_at(v) {
	var c = Math.min(1, Math.max(0, v / 255));
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

var srgb_to_linear = new Float32Array(256);
for (var i = 0; i < 256; i++) {
	var c = i / 255;
	srgb_to_linear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linear_to_srgb(x) {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/**
 * Camera Raw style develop: works in the same way on preview copy and full image
 * (all radii are relative to image size)
 */
export function camera_raw_process(p) {
	return function (src, dst, width, height) {
		if (is_identity(p) || !width) {
			dst.set(src);
			return;
		}
		//16 bit documents pass float arrays (0..255 with fractions)
		var hd = src instanceof Float32Array;
		var size = width * height;
		var need_local = p.highlights || p.shadows || p.dehaze;
		var local = need_local ? blurred_luminance(src, width, height, relative_radius(width, height, 0.02)) : null;
		var tex = p.texture ? blurred_luminance(src, width, height, relative_radius(width, height, 0.0025)) : null;
		var cla = p.clarity ? blurred_luminance(src, width, height, relative_radius(width, height, 0.012)) : null;
		var fine = (p.sharpen || p.noise) ? blurred_luminance(src, width, height, Math.max(0.7, relative_radius(width, height, 0.00018))) : null;

		var exposure = Math.pow(2, p.exposure);
		var wb_r = 1 + p.temp * 0.0025, wb_b = 1 - p.temp * 0.0025, wb_g = 1 - p.tint * 0.0022;
		var contrast = p.contrast / 100;
		var cx = width / 2, cy = height / 2, max_d = Math.sqrt(cx * cx + cy * cy);
		var seed = 12345;

		for (var i = 0, j = 0; i < size; i++, j += 4) {
			var r = (hd ? lin_at(src[j]) : srgb_to_linear[src[j]]) * wb_r * exposure;
			var g = (hd ? lin_at(src[j + 1]) : srgb_to_linear[src[j + 1]]) * wb_g * exposure;
			var b = (hd ? lin_at(src[j + 2]) : srgb_to_linear[src[j + 2]]) * wb_b * exposure;
			r = linear_to_srgb(r);
			g = linear_to_srgb(g);
			b = linear_to_srgb(b);

			var y = r * 0.2126 + g * 0.7152 + b * 0.0722;
			var ny = y;

			if (contrast) {
				var s_curve = y * y * (3 - 2 * y);
				ny += (s_curve - y) * contrast * (contrast > 0 ? 1.4 : 1.2);
			}
			if (local) {
				var base = local[i] * 0.65 + y * 0.35;
				if (p.highlights) ny += (p.highlights / 100) * 0.32 * smoothstep(0.42, 1, base) * (p.highlights < 0 ? ny : 1 - ny + 0.2);
				if (p.shadows) ny += (p.shadows / 100) * 0.38 * (1 - smoothstep(0, 0.55, base)) * (p.shadows > 0 ? 1 - ny : ny + 0.2);
			}
			if (p.whites) ny += (p.whites / 100) * 0.18 * smoothstep(0.6, 1, ny);
			if (p.blacks) ny += (p.blacks / 100) * 0.16 * (1 - smoothstep(0, 0.35, ny));
			if (tex) ny += (p.texture / 100) * 1.1 * (y - tex[i]) * (1 - Math.abs(2 * y - 1) * 0.5);
			if (cla) {
				var mid = 1 - Math.pow(2 * y - 1, 2);
				ny += (p.clarity / 100) * 0.9 * (y - cla[i]) * mid;
			}
			if (p.dehaze) {
				var k = (p.dehaze / 100) * 0.35;
				var air = local[i] * 0.9;
				ny = k > 0 ? (ny - k * air) / Math.max(0.2, 1 - k * air) : ny * (1 + k) - k * 0.5 * air;
			}
			if (fine && p.noise) {
				var diff = Math.abs(y - fine[i]);
				var amount = (p.noise / 100) * Math.exp(-diff * 18);
				ny += (fine[i] - y) * amount;
			}
			if (fine && p.sharpen) {
				ny += (p.sharpen / 100) * 0.8 * (y - fine[i]);
			}
			if (p.vignette) {
				var dx = (i % width) - cx, dy = Math.floor(i / width) - cy;
				var w = smoothstep(0.45, 1.05, Math.sqrt(dx * dx + dy * dy) / max_d);
				ny *= 1 + (p.vignette / 100) * 0.75 * w;
			}
			if (p.grain) {
				seed = (seed * 1103515245 + 12345) & 0x7fffffff;
				ny += ((seed / 0x7fffffff) - 0.5) * (p.grain / 100) * 0.12;
			}

			//apply tone change keeping hue
			if (ny != y) {
				if (y > 0.03) {
					var f = Math.max(0, Math.min(8, ny / y));
					r *= f; g *= f; b *= f;
				}
				else {
					r += ny - y; g += ny - y; b += ny - y;
				}
			}

			//saturation / vibrance / dehaze color
			var sat = p.saturation / 100;
			var vib = p.vibrance / 100;
			var extra = p.dehaze ? (p.dehaze / 100) * 0.25 : 0;
			if (sat || vib || extra) {
				var gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
				var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
				var cur = mx > 0 ? (mx - mn) / mx : 0;
				var factor = (1 + sat) * (1 + vib * (vib > 0 ? (1 - cur) * (1 - cur) : 1)) * (1 + extra);
				r = gray + (r - gray) * factor;
				g = gray + (g - gray) * factor;
				b = gray + (b - gray) * factor;
			}
			//ordered dither before rounding to 8 bit: smooth gradients without banding
			var dither = hd ? 0 : BAYER[((i % width) & 3) + (((i / width) | 0) & 3) * 4];
			dst[j] = r * 255 + dither;
			dst[j + 1] = g * 255 + dither;
			dst[j + 2] = b * 255 + dither;
			dst[j + 3] = src[j + 3];
		}
	};
}

/**
 * Filter > Camera Raw Filter (Shift+Ctrl+A)
 */
class Image_camera_raw_class {

	constructor() {
		this.preview = new Live_preview();
		this.dialog = new Adjust_dialog();
	}

	apply_params(p) {
		if (!this.preview.start()) return;
		this.preview.commit(camera_raw_process(p), 'Camera Raw 필터', { op: 'camera_raw', params: p, title: 'Camera Raw 필터' });
	}

	camera_raw() {
		var _this = this;
		if (!this.preview.start()) return;
		var body = '';
		GROUPS.forEach(function (group) {
			body += '<div class="adj_group">' + group[0] + '</div>';
			group[1].forEach(function (item) {
				body += slider_row('cr_' + item[0], item[1], item[2], item[3], item[4], item[5]);
			});
		});
		var root = null;
		var params = function () {
			var p = {};
			GROUPS.forEach(function (group) {
				group[1].forEach(function (item) { p[item[0]] = val(root, 'cr_' + item[0]); });
			});
			return p;
		};
		var refresh = function () {
			if (_this.dialog.is_preview_on()) _this.preview.update(camera_raw_process(params()));
		};
		this.dialog.open({
			title: 'Camera Raw 필터',
			body: body,
			on_open: function (el) {
				root = el;
				el.classList.add('adj_wide');
				bind_sliders(el, refresh);
				//double click a slider = back to 0 (like Camera Raw)
				el.querySelectorAll('input[type=range]').forEach(function (range) {
					range.addEventListener('dblclick', function () {
						set_slider(el, range.id, 0);
						refresh();
					});
				});
			},
			on_reset: function () {
				GROUPS.forEach(function (group) {
					group[1].forEach(function (item) { set_slider(root, 'cr_' + item[0], item[4]); });
				});
				refresh();
			},
			on_preview_toggle: function (on) {
				if (on) refresh();
				else _this.preview.update(function (src, dst) { dst.set(src); });
			},
			on_ok: function () {
				var p = params();
				_this.preview.commit(camera_raw_process(p), 'Camera Raw 필터', { op: 'camera_raw', params: p, title: 'Camera Raw 필터' });
				new Actions_recorder_class().record({ op: 'camera_raw', params: p, title: 'Camera Raw 필터' });
			},
			on_cancel: function () {
				_this.preview.cancel();
			},
		});
	}
}

export default Image_camera_raw_class;
