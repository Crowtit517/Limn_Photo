/*
 * Layer pixel surfaces: a canvas that behaves like the <img> layer.link the rest of the code expects
 * (complete, naturalWidth, src, load events, cloneNode), so edits never wait for PNG encoding.
 *
 * Undo keeps whole surfaces (swap = instant). To bound memory, surfaces that only history still
 * holds are compressed to PNG in a worker (oldest first) and decoded again when needed.
 */
import config from './../config.js';

var stamp_counter = 1;
var registry = new Set();
var archive_timer = null;

// raw pixel bytes kept for instant undo before older steps get compressed
const RAW_BUDGET_BYTES = 1200 * 1024 * 1024;

function surface_bytes(surface) {
	return (surface._w || surface.width) * (surface._h || surface.height) * 4 + (surface._hd ? surface._hd.byteLength : 0);
}

/**
 * makes a surface with a copy of source pixels (canvas, image or bitmap)
 */
export function make_surface(source, width, height) {
	var canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width || (source && (source.width || source.naturalWidth)) || 1));
	canvas.height = Math.max(1, Math.round(height || (source && (source.height || source.naturalHeight)) || 1));
	if (source) canvas.getContext('2d').drawImage(source, 0, 0);
	//16 bit data is never changed in place, so copies may share it
	if (source && source._hd && source._hd.length == canvas.width * canvas.height * 4) canvas._hd = source._hd;
	return upgrade(canvas);
}

function upgrade(canvas) {
	canvas._surface = true;
	canvas._stamp = stamp_counter++;
	canvas._src_cache = null;
	canvas._blob = null;
	canvas._archived = false;
	canvas._restoring = null;
	canvas._used = Date.now();
	Object.defineProperty(canvas, 'complete', {
		get: function () { return !this._archived; },
	});
	Object.defineProperty(canvas, 'naturalWidth', {
		get: function () { return this._archived ? this._w : this.width; },
	});
	Object.defineProperty(canvas, 'naturalHeight', {
		get: function () { return this._archived ? this._h : this.height; },
	});
	//src as data url: only for code that really needs text (slow for big images, cached)
	Object.defineProperty(canvas, 'src', {
		get: function () {
			if (this._archived) return '';
			if (!this._src_cache) this._src_cache = this.toDataURL('image/png');
			return this._src_cache;
		},
		set: function (value) {
			var _this = this;
			var image = new Image();
			image.onload = function () {
				_this.width = image.width;
				_this.height = image.height;
				_this.getContext('2d').drawImage(image, 0, 0);
				_this._stamp = stamp_counter++;
				_this._src_cache = null;
				_this.dispatchEvent(new Event('load'));
				if (typeof _this.onload == 'function') _this.onload();
				config.need_render = true;
			};
			image.src = value;
		},
	});
	canvas.cloneNode = function () {
		return make_surface(this);
	};
	registry.add(canvas);
	schedule_archive();
	return canvas;
}

export function is_surface(link) {
	return !!(link && link._surface);
}

/**
 * changes whenever layer pixels change (replaces comparing huge data url strings)
 */
export function pixel_stamp(layer) {
	var link = layer && layer.link;
	if (!link) return '';
	if (link._surface) return 's' + link._stamp;
	return 'i' + (link.src ? link.src.length + ':' + link.src.slice(-32) : '');
}

/**
 * decode compressed surface back to pixels
 */
export function restore_surface(surface) {
	if (!surface || !surface._surface || !surface._archived) return Promise.resolve(surface);
	if (surface._restoring) return surface._restoring;
	surface._restoring = createImageBitmap(surface._blob).then(function (bitmap) {
		surface.width = surface._w;
		surface.height = surface._h;
		surface.getContext('2d').drawImage(bitmap, 0, 0);
		bitmap.close && bitmap.close();
		surface._archived = false;
		surface._restoring = null;
		surface._used = Date.now();
		config.need_render = true;
		surface.dispatchEvent(new Event('load'));
		return surface;
	});
	return surface._restoring;
}

/**
 * surfaces shown in the document must stay raw
 */
function attached_surfaces() {
	var set = new Set();
	(config.layers || []).forEach(function (layer) {
		if (layer.link && layer.link._surface) set.add(layer.link);
	});
	return set;
}

/**
 * makes sure every layer surface has pixels (after undo / redo)
 */
export function restore_attached() {
	var jobs = [];
	attached_surfaces().forEach(function (surface) {
		if (surface._archived) jobs.push(restore_surface(surface));
	});
	return Promise.all(jobs);
}

/**
 * forget surfaces that history dropped
 */
export function release_surface(surface) {
	if (!surface || !surface._surface) return;
	if (attached_surfaces().has(surface)) return;
	registry.delete(surface);
	surface._blob = null;
	surface._hd = null;
	surface.width = 1;
	surface.height = 1;
}

export function touch_surface(surface) {
	if (surface && surface._surface) surface._used = Date.now();
}

function schedule_archive() {
	if (archive_timer) return;
	archive_timer = setTimeout(function () {
		archive_timer = null;
		archive_old();
	}, 1500);
}

var archiving = false;

async function archive_old() {
	if (archiving) return;
	archiving = true;
	try {
		var attached = attached_surfaces();
		var raw = [];
		var total = 0;
		registry.forEach(function (surface) {
			if (surface._archived) return;
			total += surface_bytes(surface);
			if (!attached.has(surface)) raw.push(surface);
		});
		if (total <= RAW_BUDGET_BYTES) return;
		raw.sort(function (a, b) { return a._used - b._used; });
		for (var i = 0; i < raw.length && total > RAW_BUDGET_BYTES; i++) {
			var surface = raw[i];
			if (attached_surfaces().has(surface) || surface._archived) continue;
			var blob = await encode_png(surface);
			//could have been put back into a layer while encoding
			if (!blob || attached_surfaces().has(surface)) continue;
			total -= surface_bytes(surface);
			//old history states keep only 8 bit
			surface._hd = null;
			surface._blob = blob;
			surface._w = surface.width;
			surface._h = surface.height;
			surface._archived = true;
			surface.width = 1;
			surface.height = 1;
		}
	}
	finally {
		archiving = false;
	}
}

// ----------------- PNG encoding off the main thread -----------------

var worker = null;
var worker_jobs = {};
var worker_id = 1;

function get_worker() {
	if (worker !== null) return worker;
	try {
		var code = 'self.onmessage = async function (e) {'
			+ 'var c = new OffscreenCanvas(e.data.bitmap.width, e.data.bitmap.height);'
			+ 'c.getContext("2d").drawImage(e.data.bitmap, 0, 0); e.data.bitmap.close();'
			+ 'var blob = await c.convertToBlob({ type: "image/png" });'
			+ 'self.postMessage({ id: e.data.id, blob: blob }); };';
		worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
		worker.onmessage = function (e) {
			var job = worker_jobs[e.data.id];
			delete worker_jobs[e.data.id];
			if (job) job(e.data.blob);
		};
	}
	catch (e) {
		worker = false;
	}
	return worker;
}

export async function encode_png(canvas) {
	var w = get_worker();
	if (w && typeof OffscreenCanvas != 'undefined') {
		var bitmap = await createImageBitmap(canvas);
		var id = worker_id++;
		return new Promise(function (resolve) {
			worker_jobs[id] = resolve;
			w.postMessage({ id: id, bitmap: bitmap }, [bitmap]);
		});
	}
	return new Promise(function (resolve) {
		canvas.toBlob(resolve, 'image/png');
	});
}

/**
 * memory used by raw surfaces (for diagnostics)
 */
export function surface_stats() {
	var raw = 0, archived = 0, count = 0;
	registry.forEach(function (surface) {
		count++;
		if (surface._archived) archived += surface._blob ? surface._blob.size : 0;
		else raw += surface_bytes(surface);
	});
	return { count: count, raw_mb: Math.round(raw / 1048576), archived_mb: Math.round(archived / 1048576) };
}
