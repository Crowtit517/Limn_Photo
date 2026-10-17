/*
 * Local AI (runs on this PC, no internet):
 * - SlimSAM (Segment Anything, Apache-2.0) via transformers.js: object selection
 * - LaMa (Apache-2.0) via onnxruntime-web: spot healing / content-aware fill
 * Models are in /models, runtimes in /node_modules (loaded on first use).
 */
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const TRANSFORMERS_URL = '/node_modules/@huggingface/transformers/dist/transformers.min.js';
const TRANSFORMERS_WASM = '/node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/';
const ORT_URL = '/node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs';
const ORT_WASM = '/node_modules/onnxruntime-web/dist/';
const LAMA_MODEL = '/models/lama/lama_fp32.onnx';
const LAMA_SIZE = 512;

var sam = null;       //{ T, model, processor }
var sam_loading = null;
var sam_cache = null; //{ key, inputs, embeddings }
var lama = null;      //{ ort, session }
var lama_loading = null;

function new_canvas(w, h) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

async function with_message(text, job) {
	var note = alertify.message(text, 0);
	try {
		return await job();
	}
	finally {
		note.dismiss();
	}
}

export function has_webgpu() {
	return typeof navigator != 'undefined' && !!navigator.gpu;
}

// ------------------------------------------------------------------ SAM

async function load_sam() {
	if (sam) return sam;
	if (sam_loading) return sam_loading;
	sam_loading = with_message('AI 오브젝트 선택 모델을 불러오는 중…', async function () {
		var T = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
		T.env.allowRemoteModels = false;
		T.env.allowLocalModels = true;
		T.env.localModelPath = '/models/';
		T.env.backends.onnx.wasm.wasmPaths = TRANSFORMERS_WASM;
		var model = null;
		var devices = has_webgpu() ? ['webgpu', 'wasm'] : ['wasm'];
		var last_error = null;
		for (var device of devices) {
			try {
				model = await T.SamModel.from_pretrained('slimsam', { dtype: 'q8', device: device });
				break;
			}
			catch (e) {
				last_error = e;
				console.warn('SAM on ' + device + ' failed', e);
			}
		}
		if (!model) throw last_error;
		var processor = await T.AutoProcessor.from_pretrained('slimsam');
		sam = { T: T, model: model, processor: processor };
		return sam;
	});
	try {
		return await sam_loading;
	}
	finally {
		sam_loading = null;
	}
}

/**
 * image embeddings are cached per image (key = caller defined, e.g. history position)
 */
async function sam_embeddings(canvas, key) {
	var s = await load_sam();
	if (sam_cache && sam_cache.key == key) return sam_cache;
	return with_message('AI가 이미지를 분석하는 중…', async function () {
		var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
		var image = await s.T.RawImage.fromBlob(blob);
		var inputs = await s.processor(image);
		var embeddings = await s.model.get_image_embeddings(inputs);
		sam_cache = { key: key, inputs: inputs, embeddings: embeddings };
		return sam_cache;
	});
}

/**
 * points: [[x, y, label]] in image pixels (label 1 = object, 0 = background)
 * returns canvas (image size) with white selected object, or null
 */
export async function segment(canvas, key, points, all) {
	var s = await load_sam();
	var cache = await sam_embeddings(canvas, key);
	var original = cache.inputs.original_sizes[0];
	var reshaped = cache.inputs.reshaped_input_sizes[0];
	var sx = reshaped[1] / original[1], sy = reshaped[0] / original[0];
	var flat = [];
	var labels = [];
	for (var p of points) {
		flat.push(p[0] * sx, p[1] * sy);
		labels.push(BigInt(p[2]));
	}
	var input_points = new s.T.Tensor('float32', Float32Array.from(flat), [1, 1, points.length, 2]);
	var input_labels = new s.T.Tensor('int64', BigInt64Array.from(labels), [1, 1, points.length]);
	var outputs = await s.model(Object.assign({}, cache.embeddings, { input_points: input_points, input_labels: input_labels }));
	var masks = await s.processor.post_process_masks(outputs.pred_masks, cache.inputs.original_sizes, cache.inputs.reshaped_input_sizes);
	var scores = outputs.iou_scores.data;
	var best = 0;
	for (var i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
	if (all) {
		var list = [];
		for (var m = 0; m < scores.length; m++) {
			var c = mask_canvas(masks[0], m);
			if (c) list.push({ canvas: c.canvas, area: c.area, score: scores[m] });
		}
		return list;
	}
	var single = mask_canvas(masks[0], best);
	return single ? single.canvas : null;
}

function mask_canvas(mask, index) {
	var h = mask.dims[mask.dims.length - 2], w = mask.dims[mask.dims.length - 1];
	var data = mask.data;
	var offset = index * w * h;
	var area = 0;
	var out = new_canvas(w, h);
	var ctx = out.getContext('2d');
	var image = ctx.createImageData(w, h);
	var any = false;
	for (var j = 0; j < w * h; j++) {
		if (data[offset + j]) {
			area++;
			var o = j * 4;
			image.data[o] = image.data[o + 1] = image.data[o + 2] = image.data[o + 3] = 255;
			any = true;
		}
	}
	if (!any) return null;
	ctx.putImageData(image, 0, 0);
	return { canvas: out, area: area / (w * h) };
}

// ------------------------------------------------------------------ LaMa

async function load_lama() {
	if (lama) return lama;
	if (lama_loading) return lama_loading;
	lama_loading = with_message('AI 복구 모델을 불러오는 중… (처음 한 번, 208MB)', async function () {
		var ort = await import(/* webpackIgnore: true */ ORT_URL);
		ort.env.wasm.wasmPaths = ORT_WASM;
		var providers = has_webgpu() ? ['webgpu', 'wasm'] : ['wasm'];
		var session = null;
		var last_error = null;
		for (var provider of providers) {
			try {
				session = await ort.InferenceSession.create(LAMA_MODEL, { executionProviders: [provider] });
				break;
			}
			catch (e) {
				last_error = e;
				console.warn('LaMa on ' + provider + ' failed', e);
			}
		}
		if (!session) throw last_error;
		lama = { ort: ort, session: session };
		return lama;
	});
	try {
		return await lama_loading;
	}
	finally {
		lama_loading = null;
	}
}

function mask_bounds(mask) {
	var data = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height).data;
	var w = mask.width, h = mask.height;
	var min_x = w, min_y = h, max_x = -1, max_y = -1;
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			if (data[(y * w + x) * 4 + 3] > 0) {
				if (x < min_x) min_x = x;
				if (x > max_x) max_x = x;
				if (y < min_y) min_y = y;
				if (y > max_y) max_y = y;
			}
		}
	}
	return max_x < 0 ? null : { x: min_x, y: min_y, width: max_x - min_x + 1, height: max_y - min_y + 1 };
}

/**
 * generates content for masked area (mask alpha > 0) of image.
 * Returns patch canvas (same size as image): generated pixels inside the mask, transparent elsewhere.
 */
export async function inpaint(image, mask) {
	var bounds = mask_bounds(mask);
	if (!bounds) return null;
	var l = await load_lama();
	return with_message('AI가 영역을 채우는 중…', async function () {
		//square crop around the hole with context
		var size = Math.max(bounds.width, bounds.height);
		var margin = Math.max(32, Math.round(size * 0.6));
		var crop = Math.min(Math.max(image.width, image.height), size + margin * 2);
		var cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
		var left = Math.round(Math.max(0, Math.min(image.width - crop, cx - crop / 2)));
		var top = Math.round(Math.max(0, Math.min(image.height - crop, cy - crop / 2)));
		var crop_w = Math.min(crop, image.width), crop_h = Math.min(crop, image.height);

		var S = LAMA_SIZE;
		var img_small = new_canvas(S, S);
		var ictx = img_small.getContext('2d', { willReadFrequently: true });
		ictx.imageSmoothingQuality = 'high';
		ictx.drawImage(image, left, top, crop_w, crop_h, 0, 0, S, S);
		var mask_small = new_canvas(S, S);
		var mctx = mask_small.getContext('2d', { willReadFrequently: true });
		mctx.drawImage(mask, left, top, crop_w, crop_h, 0, 0, S, S);

		var pixels = ictx.getImageData(0, 0, S, S).data;
		var holes = mctx.getImageData(0, 0, S, S).data;
		var plane = S * S;
		var img_tensor = new Float32Array(3 * plane);
		var mask_tensor = new Float32Array(plane);
		for (var i = 0; i < plane; i++) {
			var hole = holes[i * 4 + 3] > 10;
			mask_tensor[i] = hole ? 1 : 0;
			//hide original pixels in the hole, otherwise the object can be painted back
			img_tensor[i] = hole ? 0 : pixels[i * 4] / 255;
			img_tensor[plane + i] = hole ? 0 : pixels[i * 4 + 1] / 255;
			img_tensor[plane * 2 + i] = hole ? 0 : pixels[i * 4 + 2] / 255;
		}
		var feeds = {};
		var names = l.session.inputNames;
		var image_name = names.find(function (n) { return /image|img/i.test(n); }) || names[0];
		var mask_name = names.find(function (n) { return /mask/i.test(n); }) || names[1];
		feeds[image_name] = new l.ort.Tensor('float32', img_tensor, [1, 3, S, S]);
		feeds[mask_name] = new l.ort.Tensor('float32', mask_tensor, [1, 1, S, S]);
		var results = await l.session.run(feeds);
		var output = results[l.session.outputNames[0]].data;
		var max = 0;
		for (var k = 0; k < output.length; k += 97) if (output[k] > max) max = output[k];
		var mul = max <= 1.5 ? 255 : 1;

		var out_small = new_canvas(S, S);
		var octx = out_small.getContext('2d');
		var out_image = octx.createImageData(S, S);
		for (var j = 0; j < plane; j++) {
			out_image.data[j * 4] = output[j] * mul;
			out_image.data[j * 4 + 1] = output[plane + j] * mul;
			out_image.data[j * 4 + 2] = output[plane * 2 + j] * mul;
			out_image.data[j * 4 + 3] = 255;
		}
		octx.putImageData(out_image, 0, 0);

		//generated pixels only where mask is (soft edge)
		var patch = new_canvas(image.width, image.height);
		var pctx = patch.getContext('2d');
		pctx.imageSmoothingQuality = 'high';
		pctx.drawImage(out_small, 0, 0, S, S, left, top, crop_w, crop_h);
		pctx.globalCompositeOperation = 'destination-in';
		pctx.filter = 'blur(1.5px)';
		pctx.drawImage(mask, 0, 0);
		pctx.filter = 'none';

		return patch;
	});
}
