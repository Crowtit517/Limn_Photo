import app from './../../app.js';
import config from './../../config.js';
import Pixel_selection_class, { new_canvas, MODES } from './../../core/pixel-selection.js';
import { segment } from './../../core/ai.js';
import { render_all_doc, render_layer_doc, pixels_key } from './../../core/ai-apply.js';
import { create_mask, Update_mask_action } from './../../core/layer-mask.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import { slider_row, bind_sliders, set_slider, val } from './../image/adjust.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

const WORK_PIXELS = 2000000;

/**
 * separable box mean (radius r) of a float image
 */
function box_mean(src, w, h, r) {
	r = Math.max(1, Math.round(r));
	var tmp = new Float32Array(w * h);
	var out = new Float32Array(w * h);
	for (var y = 0; y < h; y++) {
		var row = y * w, sum = 0;
		for (var x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
		for (var x2 = 0; x2 < w; x2++) {
			tmp[row + x2] = sum / (2 * r + 1);
			sum += src[row + Math.min(w - 1, x2 + r + 1)] - src[row + Math.max(0, x2 - r)];
		}
	}
	for (var x3 = 0; x3 < w; x3++) {
		var s = 0;
		for (var yy = -r; yy <= r; yy++) s += tmp[Math.min(h - 1, Math.max(0, yy)) * w + x3];
		for (var y2 = 0; y2 < h; y2++) {
			out[y2 * w + x3] = s / (2 * r + 1);
			s += tmp[Math.min(h - 1, y2 + r + 1) * w + x3] - tmp[Math.max(0, y2 - r) * w + x3];
		}
	}
	return out;
}

/**
 * guided filter: mask edges follow image edges (hair, fur)
 */
function guided_filter(I, p, w, h, r, eps) {
	var n = w * h;
	var Ip = new Float32Array(n), II = new Float32Array(n);
	for (var i = 0; i < n; i++) {
		Ip[i] = I[i] * p[i];
		II[i] = I[i] * I[i];
	}
	var mI = box_mean(I, w, h, r), mp = box_mean(p, w, h, r);
	var mIp = box_mean(Ip, w, h, r), mII = box_mean(II, w, h, r);
	var a = new Float32Array(n), b = new Float32Array(n);
	for (var j = 0; j < n; j++) {
		var v = mII[j] - mI[j] * mI[j];
		var c = mIp[j] - mI[j] * mp[j];
		a[j] = c / (v + eps);
		b[j] = mp[j] - a[j] * mI[j];
	}
	var ma = box_mean(a, w, h, r), mb = box_mean(b, w, h, r);
	var q = new Float32Array(n);
	for (var k = 0; k < n; k++) q[k] = ma[k] * I[k] + mb[k];
	return q;
}

/**
 * Select > Subject, Select > Select and Mask
 */
class Select_subject_class {

	constructor() {
		this.Selection = new Pixel_selection_class();
		this.dialog = new Adjust_dialog();
		this.busy = false;
	}

	/**
	 * one click selection of the main subject (AI)
	 */
	async subject() {
		if (this.busy || !config.WIDTH) return;
		var W = config.WIDTH, H = config.HEIGHT;
		var source = render_all_doc();
		var key = pixels_key(true);
		var cx = W / 2, cy = H / 2;
		var corners = [[2, 2, 0], [W - 3, 2, 0], [2, H - 3, 0], [W - 3, H - 3, 0]];
		var prompts = [
			[[cx, cy, 1]].concat(corners),
			[[cx, cy * 0.8, 1], [cx, cy * 1.15, 1]].concat(corners),
			[[cx, cy, 1]],
		];
		this.busy = true;
		document.getElementById('main_wrapper').style.cursor = 'progress';
		var best = null;
		try {
			for (var prompt of prompts) {
				var list = await segment(source, key, prompt, true);
				for (var c of list || []) {
					//positive points must be inside, image corners outside (else it is the background)
					var cctx = c.canvas.getContext('2d', { willReadFrequently: true });
					var sx = c.canvas.width / W, sy = c.canvas.height / H;
					var inside = function (pt) {
						return cctx.getImageData(Math.min(c.canvas.width - 1, Math.round(pt[0] * sx)), Math.min(c.canvas.height - 1, Math.round(pt[1] * sy)), 1, 1).data[3] > 127;
					};
					var positives = prompt.filter(function (pt) { return pt[2] == 1; });
					var hits = positives.filter(inside).length / positives.length;
					var corner_hits = corners.filter(inside).length;
					if (hits == 0 || corner_hits > 1) continue;
					//prefer confident, mid sized masks (not a speck)
					var size_fit = c.area < 0.01 || c.area > 0.9 ? 0.2 : 1 - Math.abs(c.area - 0.3) * 0.5;
					var value = c.score * size_fit * hits * (corner_hits ? 0.5 : 1);
					if (!best || value > best.value) best = { canvas: c.canvas, value: value };
				}
			}
		}
		catch (e) {
			console.error(e);
			alertify.error('피사체 선택에 실패했습니다: ' + (e && e.message ? e.message : e));
			return;
		}
		finally {
			this.busy = false;
			document.getElementById('main_wrapper').style.cursor = 'default';
		}
		if (!best) {
			alertify.message('피사체를 찾지 못했습니다.');
			return;
		}
		var shape = new_canvas();
		shape.getContext('2d').drawImage(best.canvas, 0, 0, shape.width, shape.height);
		this.Selection.combine(this.Selection.blurred(shape, 1), MODES[0], '피사체 선택');
	}

	// ----------------- Select and Mask -----------------

	select_and_mask() {
		var _this = this;
		if (!config.WIDTH) return;
		var W = config.WIDTH, H = config.HEIGHT;
		var scale = Math.min(1, Math.sqrt(WORK_PIXELS / (W * H)));
		var w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));

		//guide image (luminance) and starting mask at working size
		var work = new_canvas(w, h);
		var wctx = work.getContext('2d', { willReadFrequently: true });
		wctx.drawImage(render_all_doc(), 0, 0, w, h);
		var img = wctx.getImageData(0, 0, w, h).data;
		var I = new Float32Array(w * h);
		for (var i = 0, j = 0; i < w * h; i++, j += 4) I[i] = (img[j] * 0.2126 + img[j + 1] * 0.7152 + img[j + 2] * 0.0722) / 255;
		wctx.clearRect(0, 0, w, h);
		if (this.Selection.has()) wctx.drawImage(this.Selection.mask, 0, 0, w, h);
		var md = wctx.getImageData(0, 0, w, h).data;
		var P = new Float32Array(w * h);
		for (var k = 0, m = 3; k < w * h; k++, m += 4) P[k] = md[m] / 255;

		var root = null;
		var result = null;
		var timer = null;
		var compute = function () {
			var v = {
				radius: val(root, 'sm_radius'), smooth: val(root, 'sm_smooth'), feather: val(root, 'sm_feather'),
				contrast: val(root, 'sm_contrast'), shift: val(root, 'sm_shift'),
			};
			var q = P;
			if (v.smooth > 0) {
				q = box_mean(q, w, h, (v.smooth / 100) * 6 * scale + 1);
				var sharp = new Float32Array(q.length);
				for (var a = 0; a < q.length; a++) sharp[a] = Math.min(1, Math.max(0, (q[a] - 0.5) * 3 + 0.5));
				q = sharp;
			}
			if (v.radius > 0) {
				var r = Math.max(1, v.radius * scale);
				var guided = guided_filter(I, q, w, h, r, 0.0008);
				var band = box_mean(q, w, h, r);
				var mixed = new Float32Array(q.length);
				for (var b = 0; b < q.length; b++) {
					var edge = band[b] > 0.01 && band[b] < 0.99;
					mixed[b] = edge ? Math.min(1, Math.max(0, guided[b])) : q[b];
				}
				q = mixed;
			}
			if (v.feather > 0) q = box_mean(q, w, h, v.feather * scale);
			var out = new_canvas(w, h);
			var octx = out.getContext('2d');
			var image = octx.createImageData(w, h);
			var c = v.contrast / 100, s = v.shift / 100;
			for (var d = 0, e = 0; d < q.length; d++, e += 4) {
				var x = q[d] + s * 0.5;
				if (c > 0) x = (x - 0.5) * (1 + c * 9) + 0.5;
				x = Math.min(1, Math.max(0, x));
				image.data[e] = image.data[e + 1] = image.data[e + 2] = 255;
				image.data[e + 3] = x * 255;
			}
			octx.putImageData(image, 0, 0);
			var full = new_canvas();
			var fctx = full.getContext('2d');
			fctx.imageSmoothingQuality = 'high';
			fctx.drawImage(out, 0, 0, W, H);
			result = full;
			_this.Selection.preview_fill = _this.view_mode(root) == 'overlay' ? full : null;
			_this.Selection.preview_matte = _this.view_mode(root) != 'overlay' ? { mask: full, mode: _this.view_mode(root) } : null;
			_this.Selection.draw_overlay();
		};
		var refresh = function () {
			clearTimeout(timer);
			timer = setTimeout(compute, 60);
		};
		var finish = function () {
			_this.Selection.preview_fill = null;
			_this.Selection.preview_matte = null;
			_this.Selection.draw_overlay();
		};
		var body = '<div class="adj_row"><label>보기</label><select class="adj_select" id="sm_view">'
			+ '<option value="overlay">오버레이</option><option value="black">검정 바탕</option><option value="white">흰색 바탕</option></select></div>'
			+ '<div class="adj_group">가장자리 감지</div>'
			+ slider_row('sm_radius', '반경(픽셀)', 0, 250, 0)
			+ '<div class="adj_group">전체 조정</div>'
			+ slider_row('sm_smooth', '매끄럽게', 0, 100, 0)
			+ slider_row('sm_feather', '페더(픽셀)', 0, 250, 0, 0.1)
			+ slider_row('sm_contrast', '대비(%)', 0, 100, 0)
			+ slider_row('sm_shift', '가장자리 이동(%)', -100, 100, 0)
			+ '<div class="adj_row"><label>출력 위치</label><select class="adj_select" id="sm_output">'
			+ '<option value="selection">선택</option><option value="mask">레이어 마스크</option>'
			+ '<option value="new_layer">레이어 마스크가 있는 새 레이어</option></select></div>';
		this.dialog.open({
			title: '선택 및 마스크',
			body: body,
			on_open: function (el) {
				root = el;
				el.classList.add('adj_wide');
				bind_sliders(el, refresh);
				el.querySelector('#sm_view').addEventListener('change', compute);
				compute();
			},
			on_reset: function () {
				['sm_radius', 'sm_smooth', 'sm_feather', 'sm_contrast', 'sm_shift'].forEach(function (id) { set_slider(root, id, 0); });
				compute();
			},
			on_preview_toggle: function () {},
			on_ok: function () {
				var output = root ? root.querySelector('#sm_output').value : 'selection';
				finish();
				if (result) _this.output(result, output);
			},
			on_cancel: finish,
		});
	}

	view_mode(root) {
		return root ? root.querySelector('#sm_view').value : 'overlay';
	}

	async output(mask, where) {
		if (where == 'selection') {
			this.Selection.set(mask, '선택 및 마스크');
			return;
		}
		var layer = config.layer;
		if (!layer || layer.type == null) {
			alertify.error('레이어를 먼저 선택하세요.');
			return;
		}
		var gray = create_mask(0);
		var white = new_canvas();
		var wctx = white.getContext('2d');
		wctx.fillStyle = '#ffffff';
		wctx.fillRect(0, 0, white.width, white.height);
		wctx.globalCompositeOperation = 'destination-in';
		wctx.drawImage(mask, 0, 0);
		gray.canvas.getContext('2d').drawImage(white, 0, 0);
		if (where == 'mask') {
			await app.State.do_action(new app.Actions.Bundle_action('select_and_mask', '선택 및 마스크', [
				new Update_mask_action(layer.id, gray, true),
			]));
			return;
		}
		//new layer = copy of the layer with the mask
		app.GUI.modules['layer/duplicate'].duplicate();
		await new Promise(function (resolve) { setTimeout(resolve, 300); });
		await app.State.do_action(new Update_mask_action(config.layer.id, gray, true), { merge_with_history: 'duplicate_layer' });
	}
}

export default Select_subject_class;
