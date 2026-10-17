import config from './../../config.js';
import { Live_preview, Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, set_slider, val } from './adjust.js';
import { blurred_rgba } from './../../libs/image-math.js';
import Actions_recorder_class from './../../core/actions-recorder.js';

/**
 * radius in image pixels -> radius on the (maybe smaller) preview copy
 */
function scaled(radius, width) {
	var full = (config.layer && (config.layer.width_original || config.layer.width)) || width;
	return radius * width / full;
}

export function high_pass(radius) {
	return function (src, dst, width, height) {
		var blur = blurred_rgba(src, width, height, scaled(radius, width));
		for (var i = 0; i < src.length; i += 4) {
			dst[i] = 128 + src[i] - blur[i];
			dst[i + 1] = 128 + src[i + 1] - blur[i + 1];
			dst[i + 2] = 128 + src[i + 2] - blur[i + 2];
			dst[i + 3] = src[i + 3];
		}
	};
}

export function unsharp_mask(amount, radius, threshold) {
	return function (src, dst, width, height) {
		var blur = blurred_rgba(src, width, height, scaled(radius, width));
		var k = amount / 100;
		for (var i = 0; i < src.length; i += 4) {
			for (var c = 0; c < 3; c++) {
				var diff = src[i + c] - blur[i + c];
				dst[i + c] = Math.abs(diff) * 2 < threshold ? src[i + c] : src[i + c] + diff * k;
			}
			dst[i + 3] = src[i + 3];
		}
	};
}

export function gaussian_blur(radius) {
	return function (src, dst, width, height) {
		dst.set(blurred_rgba(src, width, height, scaled(radius, width)));
	};
}

/**
 * Smart Sharpen: unsharp mask that leaves flat (noisy) areas alone
 */
export function smart_sharpen(amount, radius, noise) {
	return function (src, dst, width, height) {
		var blur = blurred_rgba(src, width, height, scaled(radius, width));
		var k = amount / 100, floor = noise * 0.6;
		for (var i = 0; i < src.length; i += 4) {
			var l = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
			var bl = blur[i] * 0.299 + blur[i + 1] * 0.587 + blur[i + 2] * 0.114;
			var detail = l - bl;
			var gate = Math.max(0, Math.min(1, (Math.abs(detail) - floor * 0.15) / (2 + floor * 0.15)));
			for (var c = 0; c < 3; c++) dst[i + c] = src[i + c] + (src[i + c] - blur[i + c]) * k * gate;
			dst[i + 3] = src[i + 3];
		}
	};
}

/**
 * Blur Gallery: tilt-shift (sharp band) and iris (sharp ellipse), blur grows away from the sharp area
 */
export function blur_gallery(mode, p) {
	return function (src, dst, width, height) {
		var levels = [0.25, 0.5, 1].map(function (f) { return blurred_rgba(src, width, height, scaled(p.blur * f, width)); });
		var cx = p.cx / 100 * width, cy = p.cy / 100 * height;
		var rad = (p.angle || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
		for (var y = 0, i = 0; y < height; y++) {
			for (var x = 0; x < width; x++, i += 4) {
				var t;
				if (mode == 'tilt') {
					var d = Math.abs(-(x - cx) * sin + (y - cy) * cos) / height * 100;
					t = (d - p.focus / 2) / Math.max(1, p.transition);
				}
				else {
					var dx = (x - cx) / (p.rx / 100 * width), dy = (y - cy) / (p.ry / 100 * height);
					t = (Math.sqrt(dx * dx + dy * dy) - p.focus / 100) / Math.max(0.01, 1 - p.focus / 100);
				}
				t = Math.max(0, Math.min(1, t));
				var level = t * 3, lo = Math.floor(level), f = level - lo;
				var a = lo == 0 ? src : levels[lo - 1], b = lo >= 3 ? levels[2] : levels[lo];
				for (var c = 0; c < 4; c++) dst[i + c] = a[i + c] + (b[i + c] - a[i + c]) * f;
			}
		}
	};
}

export function filter_process(name, p) {
	if (name == 'gaussian_blur') return gaussian_blur(p[0]);
	if (name == 'unsharp_mask') return unsharp_mask(p[0], p[1], p[2]);
	if (name == 'smart_sharpen') return smart_sharpen(p[0], p[1], p[2]);
	if (name == 'tilt_shift') return blur_gallery('tilt', { blur: p[0], cx: 50, cy: p[1], focus: p[2], transition: p[3], angle: p[4] });
	if (name == 'iris_blur') return blur_gallery('iris', { blur: p[0], cx: p[1], cy: p[2], rx: p[3], ry: p[4], focus: p[5] });
	return high_pass(p[0]);
}

const FILTER_BY_TITLE = { '가우시안 흐림 효과': 'gaussian_blur', '언샵 마스크': 'unsharp_mask', '하이 패스': 'high_pass', '고급 선명 효과': 'smart_sharpen', '기울기-이동': 'tilt_shift', '조리개 흐림 효과': 'iris_blur' };
const FILTER_TITLES = { gaussian_blur: '가우시안 흐림 효과', unsharp_mask: '언샵 마스크', high_pass: '하이 패스', smart_sharpen: '고급 선명 효과', tilt_shift: '기울기-이동', iris_blur: '조리개 흐림 효과' };

/**
 * Filter menu: Gaussian Blur, Unsharp Mask, High Pass with live preview
 */
class Image_filters_class {

	constructor() {
		this.preview = new Live_preview();
		this.dialog = new Adjust_dialog();
	}

	run(title, body, build, ids) {
		var _this = this;
		if (!this.preview.start()) return;
		var root = null;
		var refresh = function () {
			if (_this.dialog.is_preview_on()) _this.preview.update(build(root));
		};
		this.dialog.open({
			title: title,
			body: body,
			on_open: function (el) {
				root = el;
				bind_sliders(el, refresh);
				refresh();
			},
			on_reset: function () {
				ids.forEach(function (item) { set_slider(root, item[0], item[1]); });
				refresh();
			},
			on_preview_toggle: function (on) {
				if (on) refresh();
				else _this.preview.update(function (src, dst) { dst.set(src); });
			},
			on_ok: function () {
				_this.preview.commit(build(root), title, { op: 'filter', name: FILTER_BY_TITLE[title], params: ids.map(function (item) { return val(root, item[0]); }), title: title });
				new Actions_recorder_class().record({
					op: 'filter', name: FILTER_BY_TITLE[title], title: title,
					params: ids.map(function (item) { return val(root, item[0]); }),
				});
			},
			on_cancel: function () {
				_this.preview.cancel();
			},
		});
	}

	apply_params(name, p) {
		var process = filter_process(name, p);
		if (!this.preview.start()) return;
		this.preview.commit(process, FILTER_TITLES[name], { op: 'filter', name: name, params: p, title: FILTER_TITLES[name] });
	}

	smart_sharpen() {
		this.run('고급 선명 효과',
			slider_row('ss_amount', '양(%)', 1, 500, 150)
			+ slider_row('ss_radius', '반경(픽셀)', 0.1, 64, 1, 0.1)
			+ slider_row('ss_noise', '노이즈 감소(%)', 0, 100, 10),
			function (root) { return smart_sharpen(val(root, 'ss_amount'), val(root, 'ss_radius'), val(root, 'ss_noise')); },
			[['ss_amount', 150], ['ss_radius', 1], ['ss_noise', 10]]);
	}

	tilt_shift() {
		this.run('기울기-이동',
			slider_row('bg_blur', '흐림(픽셀)', 1, 100, 15) + slider_row('bg_cy', '중심 위치(%)', 0, 100, 50)
			+ slider_row('bg_focus', '선명한 띠(%)', 0, 100, 20) + slider_row('bg_transition', '전환(%)', 1, 100, 25)
			+ slider_row('bg_angle', '각도(°)', -90, 90, 0),
			function (root) {
				return blur_gallery('tilt', { blur: val(root, 'bg_blur'), cx: 50, cy: val(root, 'bg_cy'), focus: val(root, 'bg_focus'),
					transition: val(root, 'bg_transition'), angle: val(root, 'bg_angle') });
			},
			[['bg_blur', 15], ['bg_cy', 50], ['bg_focus', 20], ['bg_transition', 25], ['bg_angle', 0]]);
	}

	iris_blur() {
		this.run('조리개 흐림 효과',
			slider_row('ib_blur', '흐림(픽셀)', 1, 100, 15) + slider_row('ib_cx', '중심 X(%)', 0, 100, 50) + slider_row('ib_cy', '중심 Y(%)', 0, 100, 50)
			+ slider_row('ib_rx', '가로 크기(%)', 5, 100, 35) + slider_row('ib_ry', '세로 크기(%)', 5, 100, 35)
			+ slider_row('ib_focus', '선명한 부분(%)', 0, 95, 40),
			function (root) {
				return blur_gallery('iris', { blur: val(root, 'ib_blur'), cx: val(root, 'ib_cx'), cy: val(root, 'ib_cy'),
					rx: val(root, 'ib_rx'), ry: val(root, 'ib_ry'), focus: val(root, 'ib_focus') });
			},
			[['ib_blur', 15], ['ib_cx', 50], ['ib_cy', 50], ['ib_rx', 35], ['ib_ry', 35], ['ib_focus', 40]]);
	}

	gaussian_blur() {
		this.run('가우시안 흐림 효과',
			slider_row('gb_radius', '반경(픽셀)', 0.1, 250, 4, 0.1),
			function (root) { return gaussian_blur(val(root, 'gb_radius')); },
			[['gb_radius', 4]]);
	}

	unsharp_mask() {
		this.run('언샵 마스크',
			slider_row('um_amount', '양(%)', 1, 500, 100)
			+ slider_row('um_radius', '반경(픽셀)', 0.1, 250, 1, 0.1)
			+ slider_row('um_threshold', '한계값(레벨)', 0, 255, 0),
			function (root) { return unsharp_mask(val(root, 'um_amount'), val(root, 'um_radius'), val(root, 'um_threshold')); },
			[['um_amount', 100], ['um_radius', 1], ['um_threshold', 0]]);
	}

	high_pass() {
		this.run('하이 패스',
			slider_row('hp_radius', '반경(픽셀)', 0.1, 250, 10, 0.1),
			function (root) { return high_pass(val(root, 'hp_radius')); },
			[['hp_radius', 10]]);
	}
}

export default Image_filters_class;
