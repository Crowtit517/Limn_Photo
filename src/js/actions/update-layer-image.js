import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { Base_action } from './base.js';
import { make_surface, restore_surface, release_surface, touch_surface } from './../core/layer-surface.js';
import { is_16bit, merge_hd } from './../core/hd-image.js';

export class Update_layer_image_action extends Base_action {
	/**
	 * updates layer image data
	 *
	 * Pixels are copied right away into a layer surface (canvas), so callers may reuse their canvas.
	 * Undo / redo swap surfaces in memory: no PNG encoding on the way, even for big photos.
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 * @param {Uint16Array} hd (optional) 16 bit data of the new pixels
	 */
	constructor(canvas, layer_id, hd) {
		super('update_layer_image', 'Update Layer Image');
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.new_surface = canvas && (canvas.width || canvas.naturalWidth) ? make_surface(canvas) : null;
		//16 bit documents: new 16 bit data, or the old one with the pixels an 8 bit tool changed
		if (this.new_surface && is_16bit()) {
			var layer = app.Layers.get_layer(this.layer_id);
			if (hd && hd.length == this.new_surface.width * this.new_surface.height * 4) {
				this.new_surface._hd = hd;
			}
			else if (layer && layer.type == 'image') {
				var old = layer.link && layer.link._hd;
				this.new_surface._hd = merge_hd(old && layer.link.width == this.new_surface.width && layer.link.height == this.new_surface.height ? old : null, this.new_surface);
			}
		}
		this.old_link = null;
		this.reference_layer = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (this.reference_layer.type != 'image'){
			alertify.error('이미지 레이어여야 합니다.');
			throw new Error('Aborted - layer is not an image');
		}
		if (!this.new_surface) {
			//nothing to store (tool had no result) - never put an empty image into the layer
			throw new Error('Aborted - no image data');
		}
		await restore_surface(this.new_surface);
		if (this.old_link == null) {
			this.old_link = this.reference_layer.link;
		}
		this.memory_estimate = this.new_surface.width * this.new_surface.height * 4;
		this.reference_layer.link = this.new_surface;
		touch_surface(this.new_surface);
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.old_link) {
			await restore_surface(this.old_link);
			this.reference_layer.link = this.old_link;
			touch_surface(this.old_link);
		}
		this.reference_layer = null;
		config.need_render = true;
	}

	free() {
		//dropped from history: forget pixels nobody can reach any more
		if (this.is_done) {
			release_surface(this.old_link);
		}
		else {
			release_surface(this.new_surface);
		}
		this.old_link = null;
		this.new_surface = null;
		this.reference_layer = null;
	}
}
