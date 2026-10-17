import app from './../../app.js';
import config from './../../config.js';
import Pixel_selection_class from './../../core/pixel-selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

const WORK_PIXELS = 1500000;

const TOOLS = [
	['warp', '뒤틀기 (W)', 'w', '<path d="M5 19c4-1 5-5 7-8s4-5 7-6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 4l4 1-1 4" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
	['reconstruct', '재구성 (R)', 'r', '<path d="M5 12a7 7 0 1 0 2-5M5 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
	['smooth', '매끄럽게 (E)', 'e', '<path d="M4 14c3-4 5 4 8 0s5 4 8 0" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
	['pucker', '오목 (S)', 's', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 5v4M12 15v4M5 12h4M15 12h4" stroke="currentColor" stroke-width="1.6"/>'],
	['bloat', '볼록 (B)', 'b', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9V3M12 15v6M9 12H3M15 12h6" stroke="currentColor" stroke-width="1.6"/>'],
];

function sample(src, w, h, x, y, out, o) {
	if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
	if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
	var x0 = x | 0, y0 = y | 0;
	var x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
	var fx = x - x0, fy = y - y0;
	var a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
	for (var k = 0; k < 4; k++) {
		var top = src[a + k] + (src[b + k] - src[a + k]) * fx;
		var bottom = src[c + k] + (src[d + k] - src[c + k]) * fx;
		out[o + k] = top + (bottom - top) * fy;
	}
}

function sample_field(f, w, h, x, y) {
	if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
	if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
	var x0 = x | 0, y0 = y | 0;
	var x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
	var fx = x - x0, fy = y - y0;
	var top = f[y0 * w + x0] + (f[y0 * w + x1] - f[y0 * w + x0]) * fx;
	var bottom = f[y1 * w + x0] + (f[y1 * w + x1] - f[y1 * w + x0]) * fx;
	return top + (bottom - top) * fy;
}

/**
 * Filter > Liquify (Shift+Ctrl+X): own workspace with warp, reconstruct, smooth, pucker, bloat
 */
class Image_liquify_class {

	liquify() {
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('래스터 레이어에서만 사용할 수 있습니다. 레이어를 선택하거나 래스터화하세요.');
			return;
		}
		if (document.querySelector('.lq_root')) return;
		this.layer = layer;
		this.full_w = layer.width_original || layer.link.width;
		this.full_h = layer.height_original || layer.link.height;
		var s = Math.min(1, Math.sqrt(WORK_PIXELS / (this.full_w * this.full_h)));
		this.w = Math.max(1, Math.round(this.full_w * s));
		this.h = Math.max(1, Math.round(this.full_h * s));
		this.scale = s;
		var work = document.createElement('canvas');
		work.width = this.w;
		work.height = this.h;
		var wctx = work.getContext('2d', { willReadFrequently: true });
		wctx.imageSmoothingQuality = 'high';
		wctx.drawImage(layer.link, 0, 0, this.w, this.h);
		this.src = wctx.getImageData(0, 0, this.w, this.h).data;
		this.dx = new Float32Array(this.w * this.h);
		this.dy = new Float32Array(this.w * this.h);
		this.undo_stack = [];
		this.tool = 'warp';
		this.size = Math.round(Math.max(20, Math.min(this.full_w, this.full_h) / 12));
		this.pressure = 50;
		this.build_ui();
		this.render_all();
	}

	build_ui() {
		var _this = this;
		var root = document.createElement('div');
		root.className = 'lq_root';
		var tools = TOOLS.map(function (t) {
			return '<button type="button" class="lq_tool' + (t[0] == _this.tool ? ' active' : '') + '" data-tool="' + t[0]
				+ '" title="' + t[1] + '"><svg viewBox="0 0 24 24">' + t[3] + '</svg></button>';
		}).join('');
		root.innerHTML = '<div class="lq_title">유동화</div>'
			+ '<div class="lq_main"><div class="lq_tools">' + tools + '</div>'
			+ '<div class="lq_stage"><canvas class="lq_canvas"></canvas><canvas class="lq_cursor"></canvas></div>'
			+ '<div class="lq_side"><div class="adj_group">브러시 도구 옵션</div>'
			+ '<div class="adj_row"><label>크기</label><input type="range" id="lq_size" min="1" max="1500" value="' + this.size + '"><input type="number" class="adj_num" id="lq_size_n" value="' + this.size + '"></div>'
			+ '<div class="adj_row"><label>압력</label><input type="range" id="lq_pressure" min="1" max="100" value="' + this.pressure + '"><input type="number" class="adj_num" id="lq_pressure_n" value="' + this.pressure + '"></div>'
			+ '<button type="button" class="adj_btn" id="lq_restore">모두 복원</button>'
			+ '<div class="adj_hint">[ ] 크기 · Ctrl+Z 획 취소 · Enter 확인 · Esc 취소</div>'
			+ '<span class="adj_spacer"></span>'
			+ '<div class="lq_buttons"><button type="button" class="adj_btn" id="lq_cancel">취소</button>'
			+ '<button type="button" class="adj_btn primary" id="lq_ok">확인</button></div></div></div>';
		document.body.appendChild(root);
		this.root = root;
		this.canvas = root.querySelector('.lq_canvas');
		this.cursor = root.querySelector('.lq_cursor');
		this.canvas.width = this.w;
		this.canvas.height = this.h;
		this.ctx = this.canvas.getContext('2d');
		this.image = this.ctx.createImageData(this.w, this.h);
		this.fit();

		root.querySelectorAll('.lq_tool').forEach(function (button) {
			button.addEventListener('click', function () { _this.set_tool(button.dataset.tool); });
		});
		var link = function (range_id, num_id, key) {
			var range = root.querySelector('#' + range_id), num = root.querySelector('#' + num_id);
			var set = function (v) {
				_this[key] = Math.max(1, parseFloat(v) || 1);
				range.value = _this[key];
				num.value = _this[key];
			};
			range.addEventListener('input', function () { set(range.value); });
			num.addEventListener('input', function () { set(num.value); });
			return set;
		};
		this.set_size = link('lq_size', 'lq_size_n', 'size');
		link('lq_pressure', 'lq_pressure_n', 'pressure');
		root.querySelector('#lq_restore').addEventListener('click', function () {
			_this.push_undo();
			_this.dx.fill(0);
			_this.dy.fill(0);
			_this.render_all();
		});
		root.querySelector('#lq_cancel').addEventListener('click', function () { _this.close(); });
		root.querySelector('#lq_ok').addEventListener('click', function () { _this.apply(); });

		var stage = root.querySelector('.lq_stage');
		stage.addEventListener('mousedown', function (e) {
			if (e.button != 0) return;
			e.preventDefault();
			_this.stroke(e);
		});
		stage.addEventListener('mousemove', function (e) { _this.draw_cursor(e); });
		this.on_key = function (e) {
			if (e.target && (e.target.tagName == 'INPUT')) return;
			var key = e.key.toLowerCase();
			var handled = true;
			if (e.key == 'Escape') _this.close();
			else if (e.key == 'Enter') _this.apply();
			else if ((e.ctrlKey || e.metaKey) && key == 'z') _this.undo();
			else if (key == '[' || key == ']') _this.set_size(_this.size * (key == ']' ? 1.15 : 1 / 1.15));
			else {
				var tool = TOOLS.find(function (t) { return t[2] == key; });
				if (tool && !e.ctrlKey && !e.altKey) _this.set_tool(tool[0]);
				else handled = false;
			}
			if (handled) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		};
		document.addEventListener('keydown', this.on_key, true);
		this.on_resize = function () { _this.fit(); };
		window.addEventListener('resize', this.on_resize);
	}

	fit() {
		var stage = this.root.querySelector('.lq_stage');
		var sw = stage.clientWidth - 20, sh = stage.clientHeight - 20;
		var k = Math.min(sw / this.w, sh / this.h);
		this.view_scale = k;
		var cw = Math.round(this.w * k), ch = Math.round(this.h * k);
		[this.canvas, this.cursor].forEach(function (c) {
			c.style.width = cw + 'px';
			c.style.height = ch + 'px';
		});
		this.cursor.width = cw;
		this.cursor.height = ch;
	}

	set_tool(tool) {
		this.tool = tool;
		this.root.querySelectorAll('.lq_tool').forEach(function (b) { b.classList.toggle('active', b.dataset.tool == tool); });
	}

	to_work(e) {
		var rect = this.canvas.getBoundingClientRect();
		return { x: (e.clientX - rect.left) / rect.width * this.w, y: (e.clientY - rect.top) / rect.height * this.h };
	}

	draw_cursor(e) {
		var ctx = this.cursor.getContext('2d');
		ctx.clearRect(0, 0, this.cursor.width, this.cursor.height);
		if (!e) return;
		var rect = this.cursor.getBoundingClientRect();
		var r = this.size * this.scale * this.view_scale / 2;
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(e.clientX - rect.left, e.clientY - rect.top, Math.max(2, r), 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(0,0,0,0.6)';
		ctx.beginPath();
		ctx.arc(e.clientX - rect.left, e.clientY - rect.top, Math.max(2, r) + 1, 0, Math.PI * 2);
		ctx.stroke();
	}

	push_undo() {
		this.undo_stack.push([this.dx.slice(), this.dy.slice()]);
		if (this.undo_stack.length > 20) this.undo_stack.shift();
	}

	undo() {
		var last = this.undo_stack.pop();
		if (!last) return;
		this.dx = last[0];
		this.dy = last[1];
		this.render_all();
	}

	stroke(e) {
		var _this = this;
		this.push_undo();
		var last = this.to_work(e);
		var timer = null;
		var apply_at = function (p, delta) {
			_this.brush(p, delta);
		};
		apply_at(last, { x: 0, y: 0 });
		//pucker / bloat / reconstruct keep working while the mouse is held
		if (this.tool != 'warp') {
			timer = setInterval(function () { apply_at(last, { x: 0, y: 0 }); }, 40);
		}
		var move = function (ev) {
			var p = _this.to_work(ev);
			apply_at(p, { x: p.x - last.x, y: p.y - last.y });
			last = p;
			_this.draw_cursor(ev);
		};
		var up = function () {
			clearInterval(timer);
			document.removeEventListener('mousemove', move);
			document.removeEventListener('mouseup', up);
		};
		document.addEventListener('mousemove', move);
		document.addEventListener('mouseup', up);
	}

	brush(p, delta) {
		var w = this.w, h = this.h;
		var R = Math.max(2, this.size * this.scale / 2);
		var k = this.pressure / 100;
		var x0 = Math.max(0, Math.floor(p.x - R)), x1 = Math.min(w - 1, Math.ceil(p.x + R));
		var y0 = Math.max(0, Math.floor(p.y - R)), y1 = Math.min(h - 1, Math.ceil(p.y + R));
		var dx = this.dx, dy = this.dy;
		var smooth_x = null, smooth_y = null;
		if (this.tool == 'smooth') {
			smooth_x = dx.slice();
			smooth_y = dy.slice();
		}
		for (var y = y0; y <= y1; y++) {
			for (var x = x0; x <= x1; x++) {
				var ox = x - p.x, oy = y - p.y;
				var d = Math.sqrt(ox * ox + oy * oy) / R;
				if (d >= 1) continue;
				var f = (1 - d * d);
				f = f * f * k;
				var i = y * w + x;
				if (this.tool == 'warp') {
					//content follows the brush: sample from behind the movement
					dx[i] -= delta.x * f;
					dy[i] -= delta.y * f;
				}
				else if (this.tool == 'bloat') {
					dx[i] -= ox * f * 0.06;
					dy[i] -= oy * f * 0.06;
				}
				else if (this.tool == 'pucker') {
					dx[i] += ox * f * 0.06;
					dy[i] += oy * f * 0.06;
				}
				else if (this.tool == 'reconstruct') {
					dx[i] *= 1 - f * 0.15;
					dy[i] *= 1 - f * 0.15;
				}
				else if (this.tool == 'smooth' && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
					var ax = (smooth_x[i - 1] + smooth_x[i + 1] + smooth_x[i - w] + smooth_x[i + w]) / 4;
					var ay = (smooth_y[i - 1] + smooth_y[i + 1] + smooth_y[i - w] + smooth_y[i + w]) / 4;
					dx[i] += (ax - dx[i]) * f;
					dy[i] += (ay - dy[i]) * f;
				}
			}
		}
		this.render_rect(x0, y0, x1, y1);
	}

	render_rect(x0, y0, x1, y1) {
		var w = this.w, h = this.h, out = this.image.data;
		for (var y = y0; y <= y1; y++) {
			for (var x = x0; x <= x1; x++) {
				var i = y * w + x;
				sample(this.src, w, h, x + this.dx[i], y + this.dy[i], out, i * 4);
			}
		}
		this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
	}

	render_all() {
		this.render_rect(0, 0, this.w - 1, this.h - 1);
	}

	async apply() {
		var layer = this.layer;
		var W = this.full_w, H = this.full_h, w = this.w, h = this.h;
		var dx = this.dx, dy = this.dy;
		var any = false;
		for (var t = 0; t < dx.length; t++) if (dx[t] || dy[t]) { any = true; break; }
		this.close();
		if (!any) return;
		var full = document.createElement('canvas');
		full.width = W;
		full.height = H;
		var fctx = full.getContext('2d', { willReadFrequently: true });
		fctx.drawImage(layer.link, 0, 0);
		var src = fctx.getImageData(0, 0, W, H);
		var dst = fctx.createImageData(W, H);
		var s = this.scale;
		for (var y = 0; y < H; y++) {
			for (var x = 0; x < W; x++) {
				var wx = x * s, wy = y * s;
				var ddx = sample_field(dx, w, h, wx, wy) / s;
				var ddy = sample_field(dy, w, h, wx, wy) / s;
				sample(src.data, W, H, x + ddx, y + ddy, dst.data, (y * W + x) * 4);
			}
		}
		var selection = new Pixel_selection_class();
		if (selection.has()) selection.blend_arrays(src.data, dst.data, layer);
		fctx.putImageData(dst, 0, 0);
		await app.State.do_action(new app.Actions.Bundle_action('liquify', '유동화', [
			new app.Actions.Update_layer_image_action(full, layer.id),
		]));
	}

	close() {
		if (this.root) this.root.remove();
		this.root = null;
		document.removeEventListener('keydown', this.on_key, true);
		window.removeEventListener('resize', this.on_resize);
	}
}

export default Image_liquify_class;
