/*
 * Layer masks, Photoshop style: grayscale document-sized image,
 * white = visible, black = hidden.
 *
 * layer._mask = { canvas, enabled } - treated as immutable, every edit makes a new object,
 * so undo only swaps references.
 * layer._mask_editing = true while painting goes into the mask instead of the pixels.
 */
import app from './../app.js';
import config from './../config.js';
import { Base_action } from './../actions/base.js';

export function create_mask(gray, width, height) {
	var canvas = document.createElement('canvas');
	canvas.width = width || config.WIDTH;
	canvas.height = height || config.HEIGHT;
	var ctx = canvas.getContext('2d');
	var v = gray == null ? 255 : gray;
	ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	return { canvas: canvas, enabled: true };
}

export function clone_mask_canvas(mask) {
	var canvas = document.createElement('canvas');
	canvas.width = mask.canvas.width;
	canvas.height = mask.canvas.height;
	canvas.getContext('2d').drawImage(mask.canvas, 0, 0);
	return canvas;
}

/**
 * canvas whose alpha = mask brightness, for destination-in compositing (cached)
 */
export function mask_alpha_canvas(mask) {
	if (mask._alpha) return mask._alpha;
	var w = mask.canvas.width, h = mask.canvas.height;
	var alpha = document.createElement('canvas');
	alpha.width = w;
	alpha.height = h;
	var src = mask.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
	var data = src.data;
	for (var i = 0; i < data.length; i += 4) {
		data[i + 3] = data[i];
		data[i] = data[i + 1] = data[i + 2] = 0;
	}
	alpha.getContext('2d').putImageData(src, 0, 0);
	mask._alpha = alpha;
	return alpha;
}

export function invert_mask_canvas(mask) {
	var canvas = clone_mask_canvas(mask);
	var ctx = canvas.getContext('2d');
	ctx.globalCompositeOperation = 'difference';
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	return canvas;
}

/**
 * sets (or removes with null) layer mask, undoable
 */
export class Update_mask_action extends Base_action {

	constructor(layer_id, new_mask, editing) {
		super('update_mask', 'Update Mask');
		this.layer_id = parseInt(layer_id);
		this.new_mask = new_mask;
		this.editing = editing;
		this.old_mask = null;
		this.old_editing = null;
	}

	async do() {
		super.do();
		var layer = app.Layers.get_layer(this.layer_id);
		if (!layer) {
			throw new Error('Aborted - layer not found');
		}
		this.old_mask = layer._mask || null;
		this.old_editing = !!layer._mask_editing;
		layer._mask = this.new_mask;
		this.memory_estimate = this.old_mask ? this.old_mask.canvas.width * this.old_mask.canvas.height * 4 : 0;
		if (this.editing !== undefined) layer._mask_editing = this.editing && this.new_mask != null;
		if (!this.new_mask) layer._mask_editing = false;
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		var layer = app.Layers.get_layer(this.layer_id);
		if (layer) {
			layer._mask = this.old_mask;
			layer._mask_editing = this.old_editing && this.old_mask != null;
		}
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		this.old_mask = null;
		this.new_mask = null;
	}
}
