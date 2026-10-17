import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import { create_mask, invert_mask_canvas, Update_mask_action } from './../../core/layer-mask.js';
import Pixel_selection_class, { Set_pixel_selection_action } from './../../core/pixel-selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Layer > Layer Mask commands
 */
class Layer_mask_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	check_layer(need_mask) {
		var layer = config.layer;
		if (!layer || layer.type == null) {
			alertify.error('빈 레이어에는 마스크를 사용할 수 없습니다. 먼저 내용을 그리세요.');
			return null;
		}
		if (need_mask && !layer._mask) {
			alertify.error('이 레이어에는 마스크가 없습니다.');
			return null;
		}
		return layer;
	}

	add(gray) {
		var layer = this.check_layer(false);
		if (!layer) return;
		if (layer._mask) {
			alertify.error('이미 마스크가 있습니다.');
			return;
		}
		app.State.do_action(new Update_mask_action(layer.id, create_mask(gray), true));
	}

	/**
	 * like Photoshop: with a selection, the new mask shows only the selected area
	 */
	reveal_all() {
		var selection = new Pixel_selection_class();
		if (!selection.has()) {
			this.add(255);
			return;
		}
		var layer = this.check_layer(false);
		if (!layer || layer._mask) {
			if (layer) alertify.error('이미 마스크가 있습니다.');
			return;
		}
		var mask = create_mask(0);
		var ctx = mask.canvas.getContext('2d');
		var white = document.createElement('canvas');
		white.width = config.WIDTH;
		white.height = config.HEIGHT;
		var wctx = white.getContext('2d');
		wctx.fillStyle = '#ffffff';
		wctx.fillRect(0, 0, white.width, white.height);
		wctx.globalCompositeOperation = 'destination-in';
		wctx.drawImage(selection.mask, 0, 0);
		ctx.drawImage(white, 0, 0);
		app.State.do_action(new app.Actions.Bundle_action('mask_from_selection', '레이어 마스크', [
			new Update_mask_action(layer.id, mask, true),
			new Set_pixel_selection_action(null, '선택 해제'),
		]));
	}

	hide_all() {
		this.add(0);
	}

	remove() {
		var layer = this.check_layer(true);
		if (!layer) return;
		app.State.do_action(new Update_mask_action(layer.id, null, false));
	}

	invert() {
		var layer = this.check_layer(true);
		if (!layer) return;
		app.State.do_action(new Update_mask_action(layer.id,
			{ canvas: invert_mask_canvas(layer._mask), enabled: layer._mask.enabled }));
	}

	toggle() {
		var layer = this.check_layer(true);
		if (!layer) return;
		app.State.do_action(new Update_mask_action(layer.id,
			{ canvas: layer._mask.canvas, enabled: layer._mask.enabled === false }));
	}

	/**
	 * bakes mask into pixels (raster layers only)
	 */
	apply() {
		var layer = this.check_layer(true);
		if (!layer) return;
		if (layer.type != 'image') {
			alertify.error('래스터 레이어에서만 마스크를 적용할 수 있습니다. 먼저 래스터화하세요.');
			return;
		}
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		this.Base_layers.render_object(canvas.getContext('2d'),
			Object.assign({}, layer, { visible: true, _mask: Object.assign({}, layer._mask, { enabled: true }) }));
		var actions = [];
		var w = config.WIDTH, h = config.HEIGHT;
		if (layer.x != 0 || layer.y != 0 || layer.width != w || layer.height != h || layer.rotate) {
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0,
			}));
		}
		actions.push(
			new app.Actions.Update_layer_image_action(canvas, layer.id),
			new Update_mask_action(layer.id, null, false)
		);
		app.State.do_action(new app.Actions.Bundle_action('apply_mask', 'Apply Mask', actions));
	}

	edit_mask() {
		var layer = this.check_layer(true);
		if (!layer) return;
		layer._mask_editing = true;
		app.GUI.GUI_layers.render_layers();
	}

	edit_pixels() {
		if (!config.layer) return;
		config.layer._mask_editing = false;
		app.GUI.GUI_layers.render_layers();
	}
}

export default Layer_mask_class;
