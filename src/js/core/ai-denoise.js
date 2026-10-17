/*
 * AI noise reduction (NAFNet-SIDD, MIT, megvii-research) on onnxruntime-web.
 * The image is processed in overlapping tiles, then mixed with the original by strength.
 */
import { has_webgpu } from './ai.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const ORT_URL = '/node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs';
const ORT_WASM = '/node_modules/onnxruntime-web/dist/';
const MODEL = '/models/nafnet/nafnet-sidd-w32.onnx';
const TILE = 256;
const OVERLAP = 24;

var model = null;
var loading = null;

async function load() {
	if (model) return model;
	if (loading) return loading;
	loading = (async function () {
		var note = alertify.message('AI 노이즈 제거 모델을 불러오는 중… (처음 한 번, 117MB)', 0);
		try {
			var ort = await import(/* webpackIgnore: true */ ORT_URL);
			ort.env.wasm.wasmPaths = ORT_WASM;
			//CPU fallback uses more cores (default is 4)
			if (!ort.env.wasm.__threads_set) {
				ort.env.wasm.numThreads = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
				ort.env.wasm.__threads_set = true;
			}
			var providers = has_webgpu() ? ['webgpu', 'wasm'] : ['wasm'];
			var last = null;
			for (var p of providers) {
				try {
					var session = await ort.InferenceSession.create(MODEL, { executionProviders: [p] });
					model = { ort: ort, session: session, provider: p };
					return model;
				}
				catch (e) {
					last = e;
					console.warn('NAFNet on ' + p + ' failed', e);
				}
			}
			throw last;
		}
		finally {
			note.dismiss();
			loading = null;
		}
	})();
	return loading;
}

var cpu = null;

async function cpu_session(ort) {
	if (!cpu) cpu = await ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'] });
	return cpu;
}

/**
 * half precision overflow on some GPUs gives NaN or wild values (-1.7 .. 2.5) instead of 0..1,
 * a sane result stays within a small margin of that range
 */
function is_broken(data) {
	for (var j = 0; j < data.length; j++) {
		var v = data[j];
		if (!(v > -0.1 && v < 1.1)) return true;
	}
	return false;
}

/**
 * denoises RGBA data (w x h) in place into dst; progress(0..1)
 */
export async function denoise(src, dst, w, h, strength, progress) {
	var m = await load();
	var step = TILE - OVERLAP * 2;
	var tiles_x = Math.max(1, Math.ceil(w / step)), tiles_y = Math.max(1, Math.ceil(h / step));
	var total = tiles_x * tiles_y, done = 0;
	var gpu_tries = 0, gpu_fails = 0;
	var acc = new Float32Array(w * h * 3);
	var weight = new Float32Array(w * h);
	var input = new Float32Array(3 * TILE * TILE);
	//feathered tile weight (smooth seams)
	var ramp = new Float32Array(TILE);
	for (var r = 0; r < TILE; r++) {
		var edge = Math.min(r, TILE - 1 - r);
		ramp[r] = Math.min(1, (edge + 1) / OVERLAP);
	}
	for (var ty = 0; ty < tiles_y; ty++) {
		for (var tx = 0; tx < tiles_x; tx++) {
			var x0 = Math.min(Math.max(0, w - TILE), tx * step - OVERLAP);
			var y0 = Math.min(Math.max(0, h - TILE), ty * step - OVERLAP);
			x0 = Math.max(0, x0);
			y0 = Math.max(0, y0);
			var plane = TILE * TILE;
			for (var y = 0; y < TILE; y++) {
				var sy = Math.min(h - 1, y0 + y);
				for (var x = 0; x < TILE; x++) {
					var sx = Math.min(w - 1, x0 + x);
					var o = (sy * w + sx) * 4, k = y * TILE + x;
					input[k] = src[o] / 255;
					input[plane + k] = src[o + 1] / 255;
					input[plane * 2 + k] = src[o + 2] / 255;
				}
			}
			var out = null;
			if (m.provider != 'wasm' && !m.gpu_unreliable) {
				var feeds = {};
				feeds[m.session.inputNames[0]] = new m.ort.Tensor('float32', input, [1, 3, TILE, TILE]);
				out = (await m.session.run(feeds))[m.session.outputNames[0]].data;
				gpu_tries++;
				if (is_broken(out)) {
					out = null;
					gpu_fails++;
					//mostly failing: stop wasting time on the GPU for the rest of the session
					if (gpu_tries >= 6 && gpu_fails * 2 >= gpu_tries) {
						m.gpu_unreliable = true;
						console.warn('NAFNet: GPU half precision unreliable here, using CPU');
					}
				}
			}
			if (!out) {
				//some GPUs overflow in half precision: (re)do this tile on the CPU
				var cpu = m.provider == 'wasm' ? m.session : await cpu_session(m.ort);
				var again = {};
				again[cpu.inputNames[0]] = new m.ort.Tensor('float32', input, [1, 3, TILE, TILE]);
				out = (await cpu.run(again))[cpu.outputNames[0]].data;
				m.cpu_tiles = (m.cpu_tiles || 0) + 1;
			}
			for (var yy = 0; yy < TILE; yy++) {
				var dy = y0 + yy;
				if (dy >= h) break;
				for (var xx = 0; xx < TILE; xx++) {
					var dx = x0 + xx;
					if (dx >= w) break;
					var wgt = ramp[xx] * ramp[yy];
					var kk = yy * TILE + xx, i = dy * w + dx;
					acc[i * 3] += out[kk] * wgt;
					acc[i * 3 + 1] += out[plane + kk] * wgt;
					acc[i * 3 + 2] += out[plane * 2 + kk] * wgt;
					weight[i] += wgt;
				}
			}
			done++;
			if (progress) progress(done / total);
			//let the page breathe
			await new Promise(function (resolve) { setTimeout(resolve, 0); });
		}
	}
	var s = Math.max(0, Math.min(1, strength));
	for (var j = 0; j < w * h; j++) {
		var wsum = weight[j] || 1;
		for (var c = 0; c < 3; c++) {
			var raw = acc[j * 3 + c] / wsum;
			var v = raw === raw ? Math.max(0, Math.min(1, raw)) * 255 : src[j * 4 + c];
			dst[j * 4 + c] = src[j * 4 + c] + (v - src[j * 4 + c]) * s;
		}
		dst[j * 4 + 3] = src[j * 4 + 3];
	}
	return m.gpu_unreliable ? 'wasm' : m.provider;
}
