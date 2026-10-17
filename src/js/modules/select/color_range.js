import config from './../../config.js';
import Pixel_selection_class, { new_canvas, MODES } from './../../core/pixel-selection.js';
import { render_all_doc, pixels_key } from './../../core/ai-apply.js';
import { segment } from './../../core/ai.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, val } from './../image/adjust.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { view_xy } from './../../core/view-nav.js';

const PRESETS = [
	['sampled', '샘플 색상'], ['reds', '빨강 계열'], ['yellows', '노랑 계열'], ['greens', '녹색 계열'],
	['cyans', '녹청 계열'], ['blues', '파랑 계열'], ['magentas', '마젠타 계열'],
	['highlights', '밝은 영역'], ['midtones', '중간 영역'], ['shadows', '어두운 영역'], ['skin', '피부톤'],
];
const HUES = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };

function rgb_hsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
	if (max != min) {
		var d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		h = max == r ? (g - b) / d + (g < b ? 6 : 0) : max == g ? (b - r) / d + 2 : (r - g) / d + 4;
		h *= 60;
	}
	return [h, s, l];
}

/**
 * Select > Color Range, Select > Sky
 */
class Select_color_range_class {

	constructor() {
		this.Selection = new Pixel_selection_class();
		this.dialog = new Adjust_dialog();
	}

	/**
	 * selection strength (0..1) per pixel of doc image data for a preset
	 */
	build_mask(data, w, h, preset, colors, fuzziness) {
		var mask = new Uint8ClampedArray(w * h);
		var fz = Math.max(1, fuzziness);
		for (var i = 0, j = 0; i < w * h; i++, j += 4) {
			var r = data[j], g = data[j + 1], b = data[j + 2], a = 0;
			if (preset == 'sampled') {
				for (var c = 0; c < colors.length; c++) {
					var dr = r - colors[c][0], dg = g - colors[c][1], db = b - colors[c][2];
					var dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
					a = Math.max(a, 1 - dist / fz);
				}
			}
			else if (preset == 'highlights' || preset == 'midtones' || preset == 'shadows') {
				var l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
				var center = preset == 'highlights' ? 0.85 : preset == 'shadows' ? 0.15 : 0.5;
				a = 1 - Math.abs(l - center) / (0.25 + fz / 800);
			}
			else {
				var hsl = rgb_hsl(r, g, b);
				if (preset == 'skin') {
					var skin = r > 60 && r > g && g > b && r - b > 15 && hsl[0] < 50 && hsl[1] > 0.12 && hsl[1] < 0.75;
					a = skin ? 1 - Math.abs(hsl[0] - 22) / 40 : 0;
				}
				else {
					var dh = Math.abs(((hsl[0] - HUES[preset]) % 360 + 540) % 360 - 180);
					a = (1 - dh / 45) * Math.min(1, hsl[1] * 3);
				}
			}
			mask[i] = Math.max(0, Math.min(1, a)) * 255;
		}
		return mask;
	}

	color_range() {
		var _this = this;
		if (!config.WIDTH) return;
		var W = config.WIDTH, H = config.HEIGHT;
		var scale = Math.min(1, Math.sqrt(2000000 / (W * H)));
		var w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
		var work = new_canvas(w, h);
		var wctx = work.getContext('2d', { willReadFrequently: true });
		wctx.drawImage(render_all_doc(), 0, 0, w, h);
		var data = wctx.getImageData(0, 0, w, h).data;
		var colors = [this.hex(config.COLOR)];
		var root = null, result = null;

		var compute = function () {
			var preset = root.querySelector('#cr_preset').value;
			var mask = _this.build_mask(data, w, h, preset, colors, val(root, 'cr_fuzz'));
			var small = new_canvas(w, h);
			var sctx = small.getContext('2d');
			var image = sctx.createImageData(w, h);
			for (var i = 0; i < w * h; i++) {
				image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
				image.data[i * 4 + 3] = mask[i];
			}
			sctx.putImageData(image, 0, 0);
			var full = new_canvas();
			var fctx = full.getContext('2d');
			fctx.imageSmoothingQuality = 'high';
			fctx.drawImage(small, 0, 0, W, H);
			result = full;
			_this.Selection.preview_fill = full;
			_this.Selection.draw_overlay();
		};
		//click on image while dialog is open = sample colour (Shift adds)
		var pick = function (e) {
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			var p = window.Layers.get_world_coords(...view_xy(e));
			var x = Math.min(w - 1, Math.max(0, Math.round(p.x * scale))), y = Math.min(h - 1, Math.max(0, Math.round(p.y * scale)));
			var o = (y * w + x) * 4;
			var c = [data[o], data[o + 1], data[o + 2]];
			if (e.shiftKey) colors.push(c);
			else colors = [c];
			root.querySelector('#cr_preset').value = 'sampled';
			root.querySelector('#cr_swatch').style.background = 'rgb(' + c.join(',') + ')';
			compute();
		};
		var finish = function () {
			document.removeEventListener('mousedown', pick, true);
			_this.Selection.preview_fill = null;
			_this.Selection.draw_overlay();
		};
		var body = '<div class="adj_row"><label>선택</label><select class="adj_select" id="cr_preset">'
			+ PRESETS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></div>'
			+ '<div class="adj_row"><label>샘플</label><span id="cr_swatch" class="cr_swatch" style="background:' + config.COLOR + '"></span>'
			+ '<span class="adj_hint">이미지 클릭: 색 고르기 · Shift+클릭: 추가</span></div>'
			+ slider_row('cr_fuzz', '허용량', 1, 200, 40);
		this.dialog.open({
			title: '색상 범위',
			body: body,
			on_open: function (el) {
				root = el;
				bind_sliders(el, compute);
				el.querySelector('#cr_preset').addEventListener('change', compute);
				document.addEventListener('mousedown', pick, true);
				compute();
			},
			on_reset: function () { colors = [_this.hex(config.COLOR)]; compute(); },
			on_preview_toggle: function () {},
			on_ok: function () {
				finish();
				if (result) _this.Selection.combine(result, MODES[0], '색상 범위');
			},
			on_cancel: finish,
		});
	}

	hex(hex) {
		var h = (hex || '#000000').replace('#', '');
		return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
	}

	/**
	 * Select > Sky: AI candidates touching the top edge, checked against sky colours,
	 * then refined with the colour of what was found
	 */
	async sky() {
		if (!config.WIDTH || this.busy) return;
		var W = config.WIDTH, H = config.HEIGHT;
		var source = render_all_doc();
		var sctx = source.getContext('2d', { willReadFrequently: true });
		var prompts = [
			[[W * 0.5, H * 0.05, 1], [W * 0.5, H * 0.97, 0]],
			[[W * 0.2, H * 0.06, 1], [W * 0.8, H * 0.06, 1], [W * 0.5, H * 0.97, 0]],
			[[W * 0.5, H * 0.15, 1], [W * 0.1, H * 0.95, 0], [W * 0.9, H * 0.95, 0]],
		];
		this.busy = true;
		document.getElementById('main_wrapper').style.cursor = 'progress';
		var best = null;
		try {
			for (var prompt of prompts) {
				var list = await segment(source, pixels_key(true), prompt, true);
				for (var c of list || []) {
					var score = this.sky_score(c.canvas, sctx, W, H);
					if (score > 0 && (!best || c.score * score > best.value)) best = { canvas: c.canvas, value: c.score * score };
				}
			}
		}
		catch (e) {
			console.error(e);
			alertify.error('하늘 선택에 실패했습니다: ' + (e && e.message ? e.message : e));
		}
		finally {
			this.busy = false;
			document.getElementById('main_wrapper').style.cursor = 'default';
		}
		if (!best) {
			alertify.message('하늘을 찾지 못했습니다.');
			return;
		}
		var shape = new_canvas();
		shape.getContext('2d').drawImage(best.canvas, 0, 0, W, H);
		this.Selection.combine(this.Selection.blurred(shape, 2), MODES[0], '하늘 선택');
	}

	/**
	 * how sky-like a mask is: touches the top, bright / blue / grey, not most of the image
	 */
	sky_score(mask, sctx, W, H) {
		var mw = mask.width, mh = mask.height;
		var md = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mw, mh).data;
		var step = Math.max(1, Math.floor(Math.sqrt(mw * mh / 40000)));
		var img = sctx.getImageData(0, 0, W, H).data;
		var inside = 0, top = 0, top_total = 0, skyish = 0;
		for (var y = 0; y < mh; y += step) {
			for (var x = 0; x < mw; x += step) {
				var on = md[(y * mw + x) * 4 + 3] > 127;
				if (y < mh * 0.04) {
					top_total++;
					if (on) top++;
				}
				if (!on) continue;
				inside++;
				var o = (Math.floor(y * H / mh) * W + Math.floor(x * W / mw)) * 4;
				var r = img[o], g = img[o + 1], b = img[o + 2];
				var l = r * 0.299 + g * 0.587 + b * 0.114;
				if ((b >= r - 10 && l > 90) || l > 170 || (Math.abs(r - b) < 25 && l > 110)) skyish++;
			}
		}
		var total = Math.ceil(mh / step) * Math.ceil(mw / step);
		var area = inside / total;
		if (area < 0.03 || area > 0.85 || top / Math.max(1, top_total) < 0.25) return 0;
		return (skyish / Math.max(1, inside)) * (top / top_total);
	}
}

export default Select_color_range_class;
