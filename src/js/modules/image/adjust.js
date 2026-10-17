import { Live_preview, Adjust_dialog, histogram, draw_histogram, curve_lut, apply_luts, identity_lut, lut_at } from './../../libs/live-adjust.js';
import Actions_recorder_class from './../../core/actions-recorder.js';
import { blurred_luminance } from './../../libs/image-math.js';

var instance = null;

const CHANNELS = [['rgb', 'RGB'], ['r', '빨강'], ['g', '녹색'], ['b', '파랑']];
const CHANNEL_COLORS = { rgb: '#c8ccd4', r: '#ff6b6b', g: '#5fd47a', b: '#6b9bff' };

export function channel_select(id) {
	return '<select class="adj_select" id="' + id + '">'
		+ CHANNELS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('')
		+ '</select>';
}

export function slider_row(id, label, min, max, value, step) {
	return '<div class="adj_row"><label for="' + id + '">' + label + '</label>'
		+ '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '">'
		+ '<input type="number" class="adj_num" data-for="' + id + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '">'
		+ '</div>';
}

/**
 * keeps range and number inputs in sync, calls onchange on every edit
 */
export function bind_sliders(root, onchange) {
	root.querySelectorAll('input[type=range]').forEach(function (range) {
		var num = root.querySelector('.adj_num[data-for="' + range.id + '"]');
		range.addEventListener('input', function () {
			if (num) num.value = range.value;
			onchange();
		});
		if (num) {
			num.addEventListener('input', function () {
				if (num.value === '') return;
				range.value = num.value;
				onchange();
			});
		}
	});
}

export function set_slider(root, id, value) {
	var range = root.querySelector('#' + id);
	range.value = value;
	var num = root.querySelector('.adj_num[data-for="' + id + '"]');
	if (num) num.value = value;
}

export function val(root, id) {
	return parseFloat(root.querySelector('#' + id).value);
}

function level_lut(v) {
	var lut = new Float32Array(256);
	var range = Math.max(1, v[2] - v[0]);
	for (var i = 0; i < 256; i++) {
		var x = Math.min(1, Math.max(0, (i - v[0]) / range));
		x = Math.pow(x, 1 / v[1]);
		lut[i] = Math.min(255, Math.max(0, v[3] + x * (v[4] - v[3])));
	}
	return lut;
}

function combine_luts(master, channel) {
	var out = new Float32Array(256);
	for (var i = 0; i < 256; i++) out[i] = lut_at(master, channel[i]);
	return out;
}

/**
 * pixel process (src, dst RGBA arrays) from adjustment params,
 * shared by Image > Adjustments and adjustment layers
 */
/**
 * the same adjustment as a GPU filter description, or null when it needs the CPU:
 * { matrix: [20 numbers] } and / or { tables: [r, g, b] (256 values 0..255 each) }
 */
export function gpu_adjustment(kind, params) {
	params = params || {};
	var id = identity_lut();
	if (kind == 'invert') {
		var inv = new Float32Array(256);
		for (var i = 0; i < 256; i++) inv[i] = 255 - i;
		return { tables: [inv, inv, inv] };
	}
	if (kind == 'black_white' || kind == 'desaturate' && false) {
		return { matrix: [0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 1, 0] };
	}
	if (kind == 'curves') {
		var master = curve_lut(params.points.rgb);
		return { tables: ['r', 'g', 'b'].map(function (c) { return combine_luts(master, curve_lut(params.points[c])); }) };
	}
	if (kind == 'levels') {
		var lv_master = level_lut(params.values.rgb);
		return { tables: ['r', 'g', 'b'].map(function (c) { return combine_luts(lv_master, level_lut(params.values[c])); }) };
	}
	if (kind == 'brightness_contrast' || kind == 'exposure') {
		//build once on a gray ramp through the CPU process: identical curve
		var ramp = new Uint8ClampedArray(256 * 4), out = new Float32Array(256 * 4);
		for (var j = 0; j < 256; j++) { ramp[j * 4] = ramp[j * 4 + 1] = ramp[j * 4 + 2] = j; ramp[j * 4 + 3] = 255; }
		var src = new Float32Array(ramp);
		build_adjustment(kind, params)(src, out, 256, 1);
		var t = new Float32Array(256);
		for (var k = 0; k < 256; k++) t[k] = Math.max(0, Math.min(255, out[k * 4]));
		return { tables: [t, t, t] };
	}
	if (kind == 'channel_mixer') {
		var mix = params.mix || { r: [100, 0, 0, 0], g: [0, 100, 0, 0], b: [0, 0, 100, 0] };
		var row = function (m) { return [m[0] / 100, m[1] / 100, m[2] / 100, 0, m[3] * 2.55 / 255]; };
		var r = row(mix.r);
		var rows = params.monochrome ? [r, r, r] : [r, row(mix.g), row(mix.b)];
		return { matrix: rows[0].concat(rows[1], rows[2], [0, 0, 0, 1, 0]) };
	}
	if (kind == 'gradient_map') {
		var c1 = hex_rgb(params.color1 || '#000000'), c2 = hex_rgb(params.color2 || '#ffffff');
		if (params.reverse) { var tmp = c1; c1 = c2; c2 = tmp; }
		var maps = [0, 1, 2].map(function (ch) {
			var m = new Float32Array(256);
			for (var q = 0; q < 256; q++) m[q] = c1[ch] + (c2[ch] - c1[ch]) * q / 255;
			return m;
		});
		return { matrix: [0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 1, 0], tables: maps };
	}
	return null;
}

export function build_adjustment(kind, params) {
	params = params || {};
	if (kind == 'curves') {
		var master = curve_lut(params.points.rgb);
		var luts = ['r', 'g', 'b'].map(function (c) { return combine_luts(master, curve_lut(params.points[c])); });
		return function (src, dst) { apply_luts(src, dst, luts[0], luts[1], luts[2]); };
	}
	if (kind == 'levels') {
		var lv_master = level_lut(params.values.rgb);
		var lv = ['r', 'g', 'b'].map(function (c) { return combine_luts(lv_master, level_lut(params.values[c])); });
		return function (src, dst) { apply_luts(src, dst, lv[0], lv[1], lv[2]); };
	}
	if (kind == 'hue_saturation') {
		return function (src, dst) {
			hue_saturation(src, dst, params.hue, params.sat / 100, params.light / 100, !!params.colorize);
		};
	}
	if (kind == 'brightness_contrast') {
		var b = params.brightness, c = params.contrast;
		var lut = new Float32Array(256);
		var factor = c >= 0 ? 1 + c / 50 : 1 + c / 100;
		for (var i = 0; i < 256; i++) {
			//brightness as gamma-like shift that keeps black and white points
			var x = i / 255;
			x = b >= 0 ? 1 - Math.pow(1 - x, 1 + b / 100) : Math.pow(x, 1 - b / 100);
			x = (x - 0.5) * factor + 0.5;
			lut[i] = Math.min(255, Math.max(0, x * 255));
		}
		return function (src, dst) { apply_luts(src, dst, lut, lut, lut); };
	}
	if (kind == 'invert') {
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				dst[i] = 255 - src[i];
				dst[i + 1] = 255 - src[i + 1];
				dst[i + 2] = 255 - src[i + 2];
				dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'desaturate') {
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var l = (Math.max(src[i], src[i + 1], src[i + 2]) + Math.min(src[i], src[i + 1], src[i + 2])) / 2;
				dst[i] = dst[i + 1] = dst[i + 2] = l;
				dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'black_white') {
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var l = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				dst[i] = dst[i + 1] = dst[i + 2] = l;
				dst[i + 3] = src[i + 3];
			}
		};
	}

	if (kind == 'exposure') {
		var ev = Math.pow(2, params.exposure || 0), offset = params.offset || 0, gamma = params.gamma || 1;
		var lut_e = new Float32Array(256);
		for (var e = 0; e < 256; e++) {
			var lin = Math.pow(e / 255, 2.2) * ev + offset;
			lin = Math.max(0, lin);
			lut_e[e] = Math.pow(Math.min(1, lin), 1 / 2.2 / gamma) * 255;
		}
		return function (src, dst) { apply_luts(src, dst, lut_e, lut_e, lut_e); };
	}
	if (kind == 'vibrance') {
		var vib = (params.vibrance || 0) / 100, sat_k = 1 + (params.saturation || 0) / 100;
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var gray = r * 0.299 + g * 0.587 + b * 0.114;
				var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
				var cur = mx ? (mx - mn) / mx : 0;
				//vibrance protects already saturated colours and skin tones (r > g > b)
				var skin = r > g && g > b ? 0.5 : 1;
				var f = sat_k * (1 + vib * (vib > 0 ? (1 - cur) * (1 - cur) * skin : 1));
				dst[i] = gray + (r - gray) * f;
				dst[i + 1] = gray + (g - gray) * f;
				dst[i + 2] = gray + (b - gray) * f;
				dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'photo_filter') {
		var fc = hex_rgb(params.color || '#ec8a00'), density = (params.density == null ? 25 : params.density) / 100;
		var keep_l = params.preserve !== false;
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				//multiply-like warming / cooling filter
				var nr = r + (r * fc[0] / 255 - r) * density * 1.6 + (fc[0] - r) * density * 0.15;
				var ng = g + (g * fc[1] / 255 - g) * density * 1.6 + (fc[1] - g) * density * 0.15;
				var nb = b + (b * fc[2] / 255 - b) * density * 1.6 + (fc[2] - b) * density * 0.15;
				if (keep_l) {
					var d = (r * 0.299 + g * 0.587 + b * 0.114) - (nr * 0.299 + ng * 0.587 + nb * 0.114);
					nr += d; ng += d; nb += d;
				}
				dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb; dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'channel_mixer') {
		var mix = params.mix || { r: [100, 0, 0, 0], g: [0, 100, 0, 0], b: [0, 0, 100, 0] };
		var mono = !!params.monochrome;
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var out_r = (r * mix.r[0] + g * mix.r[1] + b * mix.r[2]) / 100 + mix.r[3] * 2.55;
				if (mono) {
					dst[i] = dst[i + 1] = dst[i + 2] = out_r;
				}
				else {
					dst[i] = out_r;
					dst[i + 1] = (r * mix.g[0] + g * mix.g[1] + b * mix.g[2]) / 100 + mix.g[3] * 2.55;
					dst[i + 2] = (r * mix.b[0] + g * mix.b[1] + b * mix.b[2]) / 100 + mix.b[3] * 2.55;
				}
				dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'shadows_highlights') {
		return function (src, dst, width, height) {
			var local = blurred_luminance(src, width, height, Math.sqrt(width * width + height * height) * (params.radius || 30) / 3000);
			var sh = (params.shadows || 0) / 100, hi = (params.highlights || 0) / 100;
			for (var i = 0, j = 0; j < src.length; i++, j += 4) {
				var base = local[i];
				var lift = sh * 0.6 * Math.pow(1 - base, 2) - hi * 0.6 * Math.pow(base, 2);
				for (var c = 0; c < 3; c++) {
					var v = src[j + c] / 255;
					dst[j + c] = (v + lift * (lift > 0 ? 1 - v : v)) * 255;
				}
				dst[j + 3] = src[j + 3];
			}
		};
	}
	if (kind == 'color_balance') {
		var tones = [params.shadows || [0, 0, 0], params.midtones || [0, 0, 0], params.highlights || [0, 0, 0]];
		var keep = params.preserve !== false;
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
				var l = r * 0.299 + g * 0.587 + b * 0.114;
				var ws = 1 - Math.min(1, Math.max(0, l / 0.5)); ws = ws * ws * (3 - 2 * ws);
				var wh = Math.min(1, Math.max(0, (l - 0.5) / 0.5)); wh = wh * wh * (3 - 2 * wh);
				var wm = 1 - Math.min(1, Math.abs(l - 0.5) * 2); wm = wm * wm * (3 - 2 * wm);
				var nr = r + (tones[0][0] * ws + tones[1][0] * wm + tones[2][0] * wh) / 100 * 0.35;
				var ng = g + (tones[0][1] * ws + tones[1][1] * wm + tones[2][1] * wh) / 100 * 0.35;
				var nb = b + (tones[0][2] * ws + tones[1][2] * wm + tones[2][2] * wh) / 100 * 0.35;
				nr = Math.min(1, Math.max(0, nr)); ng = Math.min(1, Math.max(0, ng)); nb = Math.min(1, Math.max(0, nb));
				if (keep) {
					var nl = nr * 0.299 + ng * 0.587 + nb * 0.114;
					var d = l - nl;
					nr += d; ng += d; nb += d;
				}
				dst[i] = nr * 255; dst[i + 1] = ng * 255; dst[i + 2] = nb * 255; dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'selective_color') {
		var groups = params.colors || {};
		var relative = params.method != 'absolute';
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var v = [src[i] / 255, src[i + 1] / 255, src[i + 2] / 255];
				var max = Math.max(v[0], v[1], v[2]), min = Math.min(v[0], v[1], v[2]);
				var mid = v[0] + v[1] + v[2] - max - min;
				var amounts = {
					reds: v[0] == max && max > min ? max - mid : 0,
					greens: v[1] == max && max > min ? max - mid : 0,
					blues: v[2] == max && max > min ? max - mid : 0,
					cyans: v[0] == min && max > min ? mid - min : 0,
					magentas: v[1] == min && max > min ? mid - min : 0,
					yellows: v[2] == min && max > min ? mid - min : 0,
					whites: min > 0.5 ? (min - 0.5) * 2 : 0,
					blacks: max < 0.5 ? (0.5 - max) * 2 : 0,
					neutrals: 1 - (Math.abs(max - 0.5) + Math.abs(min - 0.5)),
				};
				var out = v.slice();
				for (var name in groups) {
					var a = amounts[name];
					if (!a) continue;
					var cmyk = groups[name];
					for (var c = 0; c < 3; c++) {
						var ink = cmyk[c] / 100, black = cmyk[3] / 100;
						var ink_term = relative ? ink * (ink > 0 ? 1 - v[c] : v[c]) : ink;
						var black_term = relative ? black * (black > 0 ? v[c] : 1 - v[c]) : black;
						out[c] -= a * (ink_term + black_term);
					}
				}
				dst[i] = out[0] * 255; dst[i + 1] = out[1] * 255; dst[i + 2] = out[2] * 255; dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'gradient_map') {
		var c1 = hex_rgb(params.color1 || '#000000'), c2 = hex_rgb(params.color2 || '#ffffff');
		if (params.reverse) { var tmp = c1; c1 = c2; c2 = tmp; }
		var map = new Float32Array(256 * 3);
		for (var t = 0; t < 256; t++) {
			for (var ch = 0; ch < 3; ch++) map[t * 3 + ch] = c1[ch] + (c2[ch] - c1[ch]) * t / 255;
		}
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var l = Math.min(255, Math.max(0, src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114));
				var l0 = l | 0, l1 = Math.min(255, l0 + 1), f = l - l0;
				dst[i] = map[l0 * 3] + (map[l1 * 3] - map[l0 * 3]) * f;
				dst[i + 1] = map[l0 * 3 + 1] + (map[l1 * 3 + 1] - map[l0 * 3 + 1]) * f;
				dst[i + 2] = map[l0 * 3 + 2] + (map[l1 * 3 + 2] - map[l0 * 3 + 2]) * f;
				dst[i + 3] = src[i + 3];
			}
		};
	}
	if (kind == 'color_lookup') {
		var lut = params.lut;
		if (!lut || !lut.size) return function (src, dst) { dst.set(src); };
		var n = lut.size, data = lut.data, n1 = n - 1;
		var opacity = params.opacity == null ? 1 : params.opacity / 100;
		return function (src, dst) {
			for (var i = 0; i < src.length; i += 4) {
				var x = src[i] / 255 * n1, y = src[i + 1] / 255 * n1, z = src[i + 2] / 255 * n1;
				var x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
				var x1 = Math.min(n1, x0 + 1), y1 = Math.min(n1, y0 + 1), z1 = Math.min(n1, z0 + 1);
				var fx = x - x0, fy = y - y0, fz = z - z0;
				for (var c = 0; c < 3; c++) {
					//.cube order: red changes fastest
					var c000 = data[((z0 * n + y0) * n + x0) * 3 + c], c100 = data[((z0 * n + y0) * n + x1) * 3 + c];
					var c010 = data[((z0 * n + y1) * n + x0) * 3 + c], c110 = data[((z0 * n + y1) * n + x1) * 3 + c];
					var c001 = data[((z1 * n + y0) * n + x0) * 3 + c], c101 = data[((z1 * n + y0) * n + x1) * 3 + c];
					var c011 = data[((z1 * n + y1) * n + x0) * 3 + c], c111 = data[((z1 * n + y1) * n + x1) * 3 + c];
					var c00 = c000 + (c100 - c000) * fx, c10 = c010 + (c110 - c010) * fx;
					var c01 = c001 + (c101 - c001) * fx, c11 = c011 + (c111 - c011) * fx;
					var c0 = c00 + (c10 - c00) * fy, c1v = c01 + (c11 - c01) * fy;
					var value = (c0 + (c1v - c0) * fz) * 255;
					dst[i + c] = src[i + c] + (value - src[i + c]) * opacity;
				}
				dst[i + 3] = src[i + 3];
			}
		};
	}
	return function (src, dst) { dst.set(src); };
}

function hex_rgb(hex) {
	var h = hex.replace('#', '');
	if (h.length == 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}

/**
 * parses Adobe .cube 3D LUT text
 */
export function parse_cube(text) {
	var size = 0, data = [];
	var min = [0, 0, 0], max = [1, 1, 1];
	text.split(/\r?\n/).forEach(function (line) {
		line = line.trim();
		if (!line || line[0] == '#') return;
		var parts = line.split(/\s+/);
		if (parts[0] == 'LUT_3D_SIZE') size = parseInt(parts[1]);
		else if (parts[0] == 'DOMAIN_MIN') min = parts.slice(1, 4).map(parseFloat);
		else if (parts[0] == 'DOMAIN_MAX') max = parts.slice(1, 4).map(parseFloat);
		else if (/^[-\d.]/.test(parts[0]) && parts.length >= 3) {
			for (var c = 0; c < 3; c++) data.push((parseFloat(parts[c]) - min[c]) / (max[c] - min[c]));
		}
	});
	if (!size || data.length < size * size * size * 3) return null;
	return { size: size, data: data.slice(0, size * size * size * 3) };
}

const KIND_BY_TITLE = {
	'곡선': 'curves', '레벨': 'levels', '색조/채도': 'hue_saturation', '명도/대비': 'brightness_contrast',
	'색상 균형': 'color_balance', '선택 색상': 'selective_color', '그레이디언트 맵': 'gradient_map',
	'색상 검색': 'color_lookup', '반전': 'invert', '채도 감소': 'desaturate',
	'노출': 'exposure', '활기': 'vibrance', '어두운 영역/밝은 영역': 'shadows_highlights', '포토 필터': 'photo_filter', '채널 혼합': 'channel_mixer',
};

/**
 * Image > Adjustments: Curves, Levels, Hue/Saturation, Brightness/Contrast
 */
class Image_adjust_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
		this.preview = new Live_preview();
		this.dialog = new Adjust_dialog();
	}

	/**
	 * common open logic
	 */
	run(title, body, setup) {
		var _this = this;
		var target = this.layer_target;
		this.layer_target = null;
		if (target) {
			this.run_for_layer(title, body, setup, target);
			return;
		}
		if (!this.preview.start()) return;
		var state = {};
		var process = null;
		var refresh = function () {
			process = state.build();
			if (_this.dialog.is_preview_on()) {
				_this.preview.update(process);
			}
		};
		this.dialog.open({
			title: title,
			body: body,
			on_open: function (root) {
				setup(root, state, refresh, _this.preview.get_source());
				refresh();
			},
			on_reset: function () {
				state.reset();
				refresh();
			},
			on_preview_toggle: function (on) {
				if (on) _this.preview.update(process);
				else _this.preview.update(function (src, dst) { dst.set(src); });
			},
			on_ok: function () {
				_this.preview.commit(state.build(), title, { op: 'adjust', kind: KIND_BY_TITLE[title], params: state.get_params ? state.get_params() : {}, title: title });
				new Actions_recorder_class().record({ op: 'adjust', kind: KIND_BY_TITLE[title], params: state.get_params ? state.get_params() : {}, title: title });
			},
			on_cancel: function () {
				_this.preview.cancel();
			},
		});
	}

	/**
	 * same dialogs for adjustment layers: changes params of target instead of pixels.
	 * target = { params, source, on_change(params|null), on_ok(params), on_cancel() }
	 */
	run_for_layer(title, body, setup, target) {
		var _this = this;
		var state = {};
		var refresh = function () {
			if (_this.dialog.is_preview_on()) target.on_change(state.get_params());
		};
		this.dialog.open({
			title: title,
			body: body,
			on_open: function (root) {
				setup(root, state, refresh, target.source);
				if (target.params) state.set_params(target.params);
				refresh();
			},
			on_reset: function () {
				state.reset();
				refresh();
			},
			on_preview_toggle: function (on) {
				target.on_change(on ? state.get_params() : null);
			},
			on_ok: function () {
				target.on_ok(state.get_params());
			},
			on_cancel: function () {
				target.on_cancel();
			},
		});
	}

	/**
	 * opens dialog of given kind for an adjustment layer
	 */
	edit_layer(kind, target) {
		this.layer_target = target;
		this[kind]();
	}

	/**
	 * adjustment without dialog
	 */
	instant(title, process) {
		if (!this.preview.start()) return;
		this.preview.commit(process, title, { op: 'adjust', kind: KIND_BY_TITLE[title], params: {}, title: title });
		new Actions_recorder_class().record({ op: 'adjust', kind: KIND_BY_TITLE[title], params: {}, title: title });
	}

	/**
	 * replays an adjustment without dialog (Actions)
	 */
	apply_params(kind, params, title) {
		if (!this.preview.start()) return;
		this.preview.commit(build_adjustment(kind, params), title, { op: 'adjust', kind: kind, params: params, title: title });
	}

	invert() {
		this.instant('반전', build_adjustment('invert', {}));
	}

	desaturate() {
		this.instant('채도 감소', build_adjustment('desaturate', {}));
	}

	// ---------------- Curves ----------------

	curves() {
		var size = 256;
		var body = '<div class="adj_row"><label>채널</label>' + channel_select('adj_channel') + '</div>'
			+ '<canvas class="adj_curve" id="adj_curve" width="' + size + '" height="' + size + '"></canvas>'
			+ '<div class="adj_hint">클릭: 점 추가 · 드래그: 이동 · 그래프 밖으로 끌기: 삭제</div>'
			+ '<div class="adj_row adj_io"><span id="adj_io">입력: - / 출력: -</span></div>';

		this.run('곡선', body, function (root, state, refresh, source) {
			var hist = histogram(source);
			var canvas = root.querySelector('#adj_curve');
			var ctx = canvas.getContext('2d');
			var channel_el = root.querySelector('#adj_channel');
			var io = root.querySelector('#adj_io');
			var drag = null;

			state.reset = function () {
				state.points = {};
				CHANNELS.forEach(function (c) { state.points[c[0]] = [[0, 0], [255, 255]]; });
				draw();
			};
			state.get_params = function () {
				return { points: JSON.parse(JSON.stringify(state.points)) };
			};
			state.set_params = function (params) {
				state.points = JSON.parse(JSON.stringify(params.points));
				draw();
			};
			state.build = function () {
				return build_adjustment('curves', state.get_params());
			};

			var to_canvas = function (p) { return [p[0] / 255 * size, size - p[1] / 255 * size]; };
			var from_event = function (e) {
				var rect = canvas.getBoundingClientRect();
				var x = (e.clientX - rect.left) / rect.width * 255;
				var y = 255 - (e.clientY - rect.top) / rect.height * 255;
				return [x, y];
			};

			var draw = function () {
				var ch = channel_el.value;
				ctx.clearRect(0, 0, size, size);
				ctx.fillStyle = '#1b1c1f';
				ctx.fillRect(0, 0, size, size);
				draw_histogram(ctx, ch == 'rgb' ? hist.l : hist[ch], size, size, 'rgba(255,255,255,0.13)');
				ctx.strokeStyle = 'rgba(255,255,255,0.09)';
				ctx.lineWidth = 1;
				for (var i = 1; i < 4; i++) {
					ctx.beginPath();
					ctx.moveTo(i * size / 4 + 0.5, 0);
					ctx.lineTo(i * size / 4 + 0.5, size);
					ctx.moveTo(0, i * size / 4 + 0.5);
					ctx.lineTo(size, i * size / 4 + 0.5);
					ctx.stroke();
				}
				ctx.strokeStyle = 'rgba(255,255,255,0.2)';
				ctx.beginPath();
				ctx.moveTo(0, size);
				ctx.lineTo(size, 0);
				ctx.stroke();
				//other channels faintly
				CHANNELS.forEach(function (c) {
					if (c[0] == ch) return;
					var pts = state.points[c[0]];
					if (pts.length == 2 && pts[0][0] == 0 && pts[0][1] == 0 && pts[1][0] == 255 && pts[1][1] == 255) return;
					draw_curve(curve_lut(pts), CHANNEL_COLORS[c[0]], 0.35);
				});
				draw_curve(curve_lut(state.points[ch]), CHANNEL_COLORS[ch], 1);
				state.points[ch].forEach(function (p) {
					var c = to_canvas(p);
					ctx.fillStyle = drag && drag.point === p ? '#3d6df2' : '#fff';
					ctx.fillRect(c[0] - 3.5, c[1] - 3.5, 7, 7);
				});
			};
			var draw_curve = function (lut, color, alpha) {
				ctx.globalAlpha = alpha;
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.beginPath();
				for (var x = 0; x < 256; x++) {
					var c = to_canvas([x, lut[x]]);
					if (x == 0) ctx.moveTo(c[0], c[1]);
					else ctx.lineTo(c[0], c[1]);
				}
				ctx.stroke();
				ctx.globalAlpha = 1;
			};

			canvas.addEventListener('mousedown', function (e) {
				var pts = state.points[channel_el.value];
				var p = from_event(e);
				var hit = null;
				pts.forEach(function (q) {
					if (Math.abs(q[0] - p[0]) < 8 && Math.abs(q[1] - p[1]) < 8) hit = q;
				});
				if (!hit) {
					hit = [Math.round(Math.max(0, Math.min(255, p[0]))), Math.round(Math.max(0, Math.min(255, p[1])))];
					pts.push(hit);
					pts.sort(function (a, b) { return a[0] - b[0]; });
				}
				drag = { point: hit, pts: pts };
				refresh();
				draw();
				e.preventDefault();
			});
			var on_move = function (e) {
				var p = from_event(e);
				if (p[0] >= 0 && p[0] <= 255 && p[1] >= 0 && p[1] <= 255) {
					io.textContent = '입력: ' + Math.round(p[0]) + ' / 출력: ' + Math.round(p[1]);
				}
				if (!drag) return;
				var pts = drag.pts;
				var index = pts.indexOf(drag.point);
				var outside = p[1] < -25 || p[1] > 280 || p[0] < -25 || p[0] > 280;
				if (outside && pts.length > 2) {
					//drag out = delete
					if (index >= 0) pts.splice(index, 1);
				}
				else {
					if (index < 0) {
						pts.push(drag.point);
						pts.sort(function (a, b) { return a[0] - b[0]; });
						index = pts.indexOf(drag.point);
					}
					var min_x = index > 0 ? pts[index - 1][0] + 1 : 0;
					var max_x = index < pts.length - 1 ? pts[index + 1][0] - 1 : 255;
					drag.point[0] = Math.round(Math.max(min_x, Math.min(max_x, p[0])));
					drag.point[1] = Math.round(Math.max(0, Math.min(255, p[1])));
				}
				refresh();
				draw();
			};
			var on_up = function () {
				if (drag) {
					drag = null;
					draw();
				}
			};
			document.addEventListener('mousemove', on_move);
			document.addEventListener('mouseup', on_up);
			channel_el.addEventListener('change', draw);
			state.reset();
		});
	}

	// ---------------- Levels ----------------

	levels() {
		var body = '<div class="adj_row"><label>채널</label>' + channel_select('adj_channel') + '</div>'
			+ '<canvas class="adj_hist" id="adj_hist" width="256" height="110"></canvas>'
			+ '<div class="adj_group">입력 레벨</div>'
			+ slider_row('lv_in_black', '어두운 영역', 0, 253, 0)
			+ slider_row('lv_gamma', '중간 영역', 0.1, 9.99, 1, 0.01)
			+ slider_row('lv_in_white', '밝은 영역', 2, 255, 255)
			+ '<div class="adj_group">출력 레벨</div>'
			+ slider_row('lv_out_black', '최소', 0, 255, 0)
			+ slider_row('lv_out_white', '최대', 0, 255, 255)
			+ '<div class="adj_row"><span class="adj_spacer"></span><button type="button" class="adj_btn" id="lv_auto">자동</button></div>';

		this.run('레벨', body, function (root, state, refresh, source) {
			var hist = histogram(source);
			var canvas = root.querySelector('#adj_hist');
			var ctx = canvas.getContext('2d');
			var channel_el = root.querySelector('#adj_channel');
			var ids = ['lv_in_black', 'lv_gamma', 'lv_in_white', 'lv_out_black', 'lv_out_white'];
			var defaults = [0, 1, 255, 0, 255];
			var current = 'rgb';

			state.reset = function () {
				state.values = {};
				CHANNELS.forEach(function (c) { state.values[c[0]] = defaults.slice(); });
				load(current);
			};
			var load = function (ch) {
				ids.forEach(function (id, i) { set_slider(root, id, state.values[ch][i]); });
				draw();
			};
			var store = function () {
				state.values[current] = ids.map(function (id) { return val(root, id); });
			};
			state.get_params = function () {
				return { values: JSON.parse(JSON.stringify(state.values)) };
			};
			state.set_params = function (params) {
				state.values = JSON.parse(JSON.stringify(params.values));
				load(current);
			};
			state.build = function () {
				return build_adjustment('levels', state.get_params());
			};
			var draw = function () {
				var ch = channel_el.value;
				ctx.fillStyle = '#1b1c1f';
				ctx.fillRect(0, 0, 256, 110);
				draw_histogram(ctx, ch == 'rgb' ? hist.l : hist[ch], 256, 110, CHANNEL_COLORS[ch]);
				var v = state.values[ch];
				ctx.fillStyle = 'rgba(0,0,0,0.45)';
				ctx.fillRect(0, 0, v[0], 110);
				ctx.fillRect(v[2], 0, 256 - v[2], 110);
			};

			bind_sliders(root, function () {
				store();
				draw();
				refresh();
			});
			channel_el.addEventListener('change', function () {
				current = channel_el.value;
				load(current);
			});
			root.querySelector('#lv_auto').addEventListener('click', function () {
				//clip 0.1% darkest / brightest pixels per channel
				['r', 'g', 'b'].forEach(function (c) {
					var counts = hist[c];
					var total = 0;
					for (var i = 0; i < 256; i++) total += counts[i];
					var limit = total * 0.001, sum = 0, lo = 0, hi = 255;
					for (var i = 0; i < 256; i++) { sum += counts[i]; if (sum > limit) { lo = i; break; } }
					sum = 0;
					for (var i = 255; i >= 0; i--) { sum += counts[i]; if (sum > limit) { hi = i; break; } }
					if (hi - lo < 2) { lo = 0; hi = 255; }
					state.values[c] = [lo, 1, hi, 0, 255];
				});
				state.values.rgb = defaults.slice();
				load(current);
				refresh();
			});
			state.reset();
		});
	}

	// ---------------- Hue / Saturation ----------------

	hue_saturation() {
		var body = slider_row('hs_hue', '색조', -180, 180, 0)
			+ slider_row('hs_sat', '채도', -100, 100, 0)
			+ slider_row('hs_light', '밝기', -100, 100, 0)
			+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="hs_colorize"> 색상화</label></div>'
			+ '<div class="adj_bar adj_bar_hue"></div><div class="adj_bar adj_bar_hue" id="hs_result"></div>';

		this.run('색조/채도', body, function (root, state, refresh) {
			var colorize = root.querySelector('#hs_colorize');
			state.reset = function () {
				set_slider(root, 'hs_hue', 0);
				set_slider(root, 'hs_sat', 0);
				set_slider(root, 'hs_light', 0);
				colorize.checked = false;
				update_bar();
			};
			var update_bar = function () {
				root.querySelector('#hs_result').style.filter = 'hue-rotate(' + val(root, 'hs_hue') + 'deg)';
			};
			state.get_params = function () {
				return { hue: val(root, 'hs_hue'), sat: val(root, 'hs_sat'), light: val(root, 'hs_light'), colorize: colorize.checked };
			};
			state.set_params = function (params) {
				set_slider(root, 'hs_hue', params.hue);
				set_slider(root, 'hs_sat', params.sat);
				set_slider(root, 'hs_light', params.light);
				colorize.checked = !!params.colorize;
				update_bar();
			};
			state.build = function () {
				return build_adjustment('hue_saturation', state.get_params());
			};
			bind_sliders(root, function () {
				update_bar();
				refresh();
			});
			colorize.addEventListener('change', function () {
				if (colorize.checked && val(root, 'hs_sat') == 0) set_slider(root, 'hs_sat', 25);
				refresh();
			});
		});
	}

	// ---------------- Exposure / Vibrance / Shadows-Highlights / Photo Filter / Channel Mixer ----------------

	exposure() {
		var body = slider_row('ex_exposure', '노출', -5, 5, 0, 0.01) + slider_row('ex_offset', '오프셋', -0.5, 0.5, 0, 0.001)
			+ slider_row('ex_gamma', '감마 교정', 0.01, 9.99, 1, 0.01);
		this.run('노출', body, function (root, state, refresh) {
			state.reset = function () { set_slider(root, 'ex_exposure', 0); set_slider(root, 'ex_offset', 0); set_slider(root, 'ex_gamma', 1); };
			state.get_params = function () { return { exposure: val(root, 'ex_exposure'), offset: val(root, 'ex_offset'), gamma: val(root, 'ex_gamma') }; };
			state.set_params = function (p) { set_slider(root, 'ex_exposure', p.exposure); set_slider(root, 'ex_offset', p.offset); set_slider(root, 'ex_gamma', p.gamma); };
			state.build = function () { return build_adjustment('exposure', state.get_params()); };
			bind_sliders(root, refresh);
		});
	}

	vibrance() {
		var body = slider_row('vb_vibrance', '활기', -100, 100, 0) + slider_row('vb_saturation', '채도', -100, 100, 0);
		this.run('활기', body, function (root, state, refresh) {
			state.reset = function () { set_slider(root, 'vb_vibrance', 0); set_slider(root, 'vb_saturation', 0); };
			state.get_params = function () { return { vibrance: val(root, 'vb_vibrance'), saturation: val(root, 'vb_saturation') }; };
			state.set_params = function (p) { set_slider(root, 'vb_vibrance', p.vibrance); set_slider(root, 'vb_saturation', p.saturation); };
			state.build = function () { return build_adjustment('vibrance', state.get_params()); };
			bind_sliders(root, refresh);
		});
	}

	shadows_highlights() {
		var body = slider_row('sh_shadows', '어두운 영역 양(%)', 0, 100, 35) + slider_row('sh_highlights', '밝은 영역 양(%)', 0, 100, 0)
			+ slider_row('sh_radius', '반경', 5, 100, 30);
		this.run('어두운 영역/밝은 영역', body, function (root, state, refresh) {
			state.reset = function () { set_slider(root, 'sh_shadows', 35); set_slider(root, 'sh_highlights', 0); set_slider(root, 'sh_radius', 30); };
			state.get_params = function () { return { shadows: val(root, 'sh_shadows'), highlights: val(root, 'sh_highlights'), radius: val(root, 'sh_radius') }; };
			state.set_params = function (p) { set_slider(root, 'sh_shadows', p.shadows); set_slider(root, 'sh_highlights', p.highlights); set_slider(root, 'sh_radius', p.radius); };
			state.build = function () { return build_adjustment('shadows_highlights', state.get_params()); };
			bind_sliders(root, refresh);
		});
	}

	photo_filter() {
		var presets = [['#ec8a00', 'warming 필터 (85)'], ['#fa9600', 'warming 필터 (LBA)'], ['#006dff', 'cooling 필터 (80)'],
			['#00b5ff', 'cooling 필터 (LBB)'], ['#ea1a1a', '빨강'], ['#00ac00', '녹색'], ['#ac7a33', '세피아']];
		var body = '<div class="adj_row"><label>필터</label><select class="adj_select" id="pf_preset">'
			+ presets.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></div>'
			+ '<div class="adj_row"><label>색상</label><input type="color" id="pf_color" value="#ec8a00"></div>'
			+ slider_row('pf_density', '밀도(%)', 1, 100, 25)
			+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="pf_keep" checked> 광도 유지</label></div>';
		this.run('포토 필터', body, function (root, state, refresh) {
			var color = root.querySelector('#pf_color'), keep = root.querySelector('#pf_keep'), preset = root.querySelector('#pf_preset');
			state.reset = function () { color.value = '#ec8a00'; preset.value = '#ec8a00'; set_slider(root, 'pf_density', 25); keep.checked = true; };
			state.get_params = function () { return { color: color.value, density: val(root, 'pf_density'), preserve: keep.checked }; };
			state.set_params = function (p) { color.value = p.color; set_slider(root, 'pf_density', p.density); keep.checked = p.preserve !== false; };
			state.build = function () { return build_adjustment('photo_filter', state.get_params()); };
			bind_sliders(root, refresh);
			preset.addEventListener('change', function () { color.value = preset.value; refresh(); });
			[color, keep].forEach(function (el) { el.addEventListener('input', refresh); el.addEventListener('change', refresh); });
		});
	}

	channel_mixer() {
		var body = '<div class="adj_row"><label>출력 채널</label><select class="adj_select" id="cm_out">'
			+ '<option value="r">빨강</option><option value="g">녹색</option><option value="b">파랑</option></select></div>'
			+ slider_row('cm_r', '빨강(%)', -200, 200, 100) + slider_row('cm_g', '녹색(%)', -200, 200, 0)
			+ slider_row('cm_b', '파랑(%)', -200, 200, 0) + slider_row('cm_c', '상수(%)', -200, 200, 0)
			+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="cm_mono"> 단색</label></div>';
		this.run('채널 혼합', body, function (root, state, refresh) {
			var out = root.querySelector('#cm_out'), mono = root.querySelector('#cm_mono');
			var defaults = function () { return { r: [100, 0, 0, 0], g: [0, 100, 0, 0], b: [0, 0, 100, 0] }; };
			state.mix = defaults();
			var load = function () {
				var v = state.mix[out.value];
				set_slider(root, 'cm_r', v[0]); set_slider(root, 'cm_g', v[1]); set_slider(root, 'cm_b', v[2]); set_slider(root, 'cm_c', v[3]);
			};
			state.reset = function () { state.mix = defaults(); mono.checked = false; load(); };
			state.get_params = function () { return { mix: JSON.parse(JSON.stringify(state.mix)), monochrome: mono.checked }; };
			state.set_params = function (p) { state.mix = JSON.parse(JSON.stringify(p.mix)); mono.checked = !!p.monochrome; load(); };
			state.build = function () { return build_adjustment('channel_mixer', state.get_params()); };
			bind_sliders(root, function () {
				state.mix[out.value] = [val(root, 'cm_r'), val(root, 'cm_g'), val(root, 'cm_b'), val(root, 'cm_c')];
				refresh();
			});
			out.addEventListener('change', load);
			mono.addEventListener('change', function () {
				if (mono.checked) state.mix.r = [40, 40, 20, 0];
				out.value = 'r';
				load();
				refresh();
			});
		});
	}

	// ---------------- Color Balance ----------------

	color_balance() {
		var body = '<div class="adj_row"><label>톤</label><select class="adj_select" id="cb_tone">'
			+ '<option value="shadows">어두운 영역</option><option value="midtones" selected>중간 영역</option><option value="highlights">밝은 영역</option></select></div>'
			+ slider_row('cb_r', '녹청 ↔ 빨강', -100, 100, 0)
			+ slider_row('cb_g', '마젠타 ↔ 녹색', -100, 100, 0)
			+ slider_row('cb_b', '노랑 ↔ 파랑', -100, 100, 0)
			+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="cb_keep" checked> 광도 유지</label></div>';
		this.run('색상 균형', body, function (root, state, refresh) {
			var tone_el = root.querySelector('#cb_tone');
			var keep = root.querySelector('#cb_keep');
			state.values = { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] };
			var load = function () {
				var v = state.values[tone_el.value];
				set_slider(root, 'cb_r', v[0]); set_slider(root, 'cb_g', v[1]); set_slider(root, 'cb_b', v[2]);
			};
			state.reset = function () {
				state.values = { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] };
				keep.checked = true;
				load();
			};
			state.get_params = function () {
				return { shadows: state.values.shadows.slice(), midtones: state.values.midtones.slice(),
					highlights: state.values.highlights.slice(), preserve: keep.checked };
			};
			state.set_params = function (p) {
				state.values = { shadows: p.shadows.slice(), midtones: p.midtones.slice(), highlights: p.highlights.slice() };
				keep.checked = p.preserve !== false;
				load();
			};
			state.build = function () { return build_adjustment('color_balance', state.get_params()); };
			bind_sliders(root, function () {
				state.values[tone_el.value] = [val(root, 'cb_r'), val(root, 'cb_g'), val(root, 'cb_b')];
				refresh();
			});
			tone_el.addEventListener('change', load);
			keep.addEventListener('change', refresh);
		});
	}

	// ---------------- Selective Color ----------------

	selective_color() {
		var names = [['reds', '빨강 계열'], ['yellows', '노랑 계열'], ['greens', '녹색 계열'], ['cyans', '녹청 계열'],
			['blues', '파랑 계열'], ['magentas', '마젠타 계열'], ['whites', '흰색 계열'], ['neutrals', '중간색'], ['blacks', '검정 계열']];
		var body = '<div class="adj_row"><label>색상</label><select class="adj_select" id="sc_color">'
			+ names.map(function (n) { return '<option value="' + n[0] + '">' + n[1] + '</option>'; }).join('') + '</select></div>'
			+ slider_row('sc_c', '녹청', -100, 100, 0) + slider_row('sc_m', '마젠타', -100, 100, 0)
			+ slider_row('sc_y', '노랑', -100, 100, 0) + slider_row('sc_k', '검정', -100, 100, 0)
			+ '<div class="adj_row"><label class="adj_check"><input type="radio" name="sc_method" value="relative" checked> 상대치</label>'
			+ '<label class="adj_check"><input type="radio" name="sc_method" value="absolute"> 절대치</label></div>';
		this.run('선택 색상', body, function (root, state, refresh) {
			var color_el = root.querySelector('#sc_color');
			state.colors = {};
			var method = function () { return root.querySelector('input[name=sc_method]:checked').value; };
			var load = function () {
				var v = state.colors[color_el.value] || [0, 0, 0, 0];
				set_slider(root, 'sc_c', v[0]); set_slider(root, 'sc_m', v[1]); set_slider(root, 'sc_y', v[2]); set_slider(root, 'sc_k', v[3]);
			};
			state.reset = function () {
				state.colors = {};
				load();
			};
			state.get_params = function () { return { colors: JSON.parse(JSON.stringify(state.colors)), method: method() }; };
			state.set_params = function (p) {
				state.colors = JSON.parse(JSON.stringify(p.colors || {}));
				root.querySelector('input[name=sc_method][value=' + (p.method == 'absolute' ? 'absolute' : 'relative') + ']').checked = true;
				load();
			};
			state.build = function () { return build_adjustment('selective_color', state.get_params()); };
			bind_sliders(root, function () {
				state.colors[color_el.value] = [val(root, 'sc_c'), val(root, 'sc_m'), val(root, 'sc_y'), val(root, 'sc_k')];
				refresh();
			});
			color_el.addEventListener('change', load);
			root.querySelectorAll('input[name=sc_method]').forEach(function (r) { r.addEventListener('change', refresh); });
		});
	}

	// ---------------- Gradient Map ----------------

	gradient_map() {
		var body = '<div class="adj_row"><label>시작 색</label><input type="color" id="gm_1" value="#000000"></div>'
			+ '<div class="adj_row"><label>끝 색</label><input type="color" id="gm_2" value="#ffffff"></div>'
			+ '<div class="adj_bar" id="gm_bar"></div>'
			+ '<div class="adj_row"><label class="adj_check"><input type="checkbox" id="gm_reverse"> 반전</label></div>';
		this.run('그레이디언트 맵', body, function (root, state, refresh) {
			var c1 = root.querySelector('#gm_1'), c2 = root.querySelector('#gm_2'), rev = root.querySelector('#gm_reverse');
			var bar = function () {
				root.querySelector('#gm_bar').style.background = 'linear-gradient(to right,' + (rev.checked ? c2.value + ',' + c1.value : c1.value + ',' + c2.value) + ')';
			};
			state.reset = function () { c1.value = '#000000'; c2.value = '#ffffff'; rev.checked = false; bar(); };
			state.get_params = function () { return { color1: c1.value, color2: c2.value, reverse: rev.checked }; };
			state.set_params = function (p) { c1.value = p.color1; c2.value = p.color2; rev.checked = !!p.reverse; bar(); };
			state.build = function () { return build_adjustment('gradient_map', state.get_params()); };
			[c1, c2, rev].forEach(function (el) { el.addEventListener('input', function () { bar(); refresh(); }); });
			bar();
		});
	}

	// ---------------- Color Lookup (.cube) ----------------

	color_lookup() {
		var body = '<div class="adj_row"><label>3D LUT 파일</label><input type="file" id="cl_file" accept=".cube"></div>'
			+ '<div class="adj_row"><span id="cl_name" class="adj_hint">.cube 파일을 선택하세요</span></div>'
			+ slider_row('cl_opacity', '적용량(%)', 0, 100, 100);
		this.run('색상 검색', body, function (root, state, refresh) {
			state.lut = null;
			state.name = '';
			state.reset = function () { set_slider(root, 'cl_opacity', 100); };
			state.get_params = function () { return { lut: state.lut, name: state.name, opacity: val(root, 'cl_opacity') }; };
			state.set_params = function (p) {
				state.lut = p.lut; state.name = p.name || '';
				set_slider(root, 'cl_opacity', p.opacity == null ? 100 : p.opacity);
				root.querySelector('#cl_name').textContent = state.name || '.cube 파일을 선택하세요';
			};
			state.build = function () { return build_adjustment('color_lookup', state.get_params()); };
			bind_sliders(root, refresh);
			root.querySelector('#cl_file').addEventListener('change', function () {
				var file = this.files[0];
				if (!file) return;
				file.text().then(function (text) {
					var lut = parse_cube(text);
					if (!lut) {
						root.querySelector('#cl_name').textContent = '읽을 수 없는 .cube 파일입니다';
						return;
					}
					state.lut = lut;
					state.name = file.name;
					root.querySelector('#cl_name').textContent = file.name + ' (' + lut.size + '³)';
					refresh();
				});
			});
		});
	}

	// ---------------- Brightness / Contrast ----------------

	brightness_contrast() {
		var body = slider_row('bc_brightness', '명도', -150, 150, 0)
			+ slider_row('bc_contrast', '대비', -50, 100, 0);

		this.run('명도/대비', body, function (root, state, refresh) {
			state.reset = function () {
				set_slider(root, 'bc_brightness', 0);
				set_slider(root, 'bc_contrast', 0);
			};
			state.get_params = function () {
				return { brightness: val(root, 'bc_brightness'), contrast: val(root, 'bc_contrast') };
			};
			state.set_params = function (params) {
				set_slider(root, 'bc_brightness', params.brightness);
				set_slider(root, 'bc_contrast', params.contrast);
			};
			state.build = function () {
				return build_adjustment('brightness_contrast', state.get_params());
			};
			bind_sliders(root, refresh);
		});
	}
}

/**
 * HSL based hue / saturation / lightness, similar to Photoshop "Master" channel
 */
function hue_saturation(src, dst, hue, sat, light, colorize) {
	var hue_shift = hue / 360;
	for (var i = 0; i < src.length; i += 4) {
		var r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var l = (max + min) / 2;
		var h = 0, s = 0;
		var d = max - min;
		if (d > 0) {
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			if (max == r) h = (g - b) / d + (g < b ? 6 : 0);
			else if (max == g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
		}
		if (colorize) {
			h = (hue < 0 ? hue + 360 : hue) / 360;
			s = Math.max(0, Math.min(1, sat > 0 ? sat : 0.25));
		}
		else {
			h = (h + hue_shift + 1) % 1;
			s = sat > 0 ? s + (1 - s) * sat * (d > 0 ? 1 : 0) : s * (1 + sat);
		}
		l = light > 0 ? l + (1 - l) * light : l * (1 + light);

		if (s == 0) {
			r = g = b = l;
		}
		else {
			var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			var p = 2 * l - q;
			r = hue_to_rgb(p, q, h + 1 / 3);
			g = hue_to_rgb(p, q, h);
			b = hue_to_rgb(p, q, h - 1 / 3);
		}
		dst[i] = r * 255;
		dst[i + 1] = g * 255;
		dst[i + 2] = b * 255;
		dst[i + 3] = src[i + 3];
	}
}

function hue_to_rgb(p, q, t) {
	if (t < 0) t += 1;
	if (t > 1) t -= 1;
	if (t < 1 / 6) return p + (q - p) * 6 * t;
	if (t < 1 / 2) return q;
	if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
	return p;
}

export default Image_adjust_class;
