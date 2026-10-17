import app from './../../app.js';
import config from './../../config.js';
import Image_adjust_class from './../image/adjust.js';
import { render_all_doc } from './../../core/ai-apply.js';
import { create_mask } from './../../core/layer-mask.js';
import Pixel_selection_class, { Set_pixel_selection_action } from './../../core/pixel-selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

// kind -> [name, default params, has dialog]
const KINDS = {
	brightness_contrast: ['명도/대비', { brightness: 0, contrast: 0 }, true],
	levels: ['레벨', null, true],
	curves: ['곡선', null, true],
	hue_saturation: ['색조/채도', { hue: 0, sat: 0, light: 0, colorize: false }, true],
	black_white: ['흑백', {}, false],
	invert: ['반전', {}, false],
	color_balance: ['색상 균형', { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0], preserve: true }, true],
	selective_color: ['선택 색상', { colors: {}, method: 'relative' }, true],
	gradient_map: ['그레이디언트 맵', { color1: '#000000', color2: '#ffffff', reverse: false }, true],
	color_lookup: ['색상 검색', { lut: null, name: '', opacity: 100 }, true],
	exposure: ['노출', { exposure: 0, offset: 0, gamma: 1 }, true],
	vibrance: ['활기', { vibrance: 0, saturation: 0 }, true],
	photo_filter: ['포토 필터', { color: '#ec8a00', density: 25, preserve: true }, true],
	channel_mixer: ['채널 혼합', { mix: { r: [100, 0, 0, 0], g: [0, 100, 0, 0], b: [0, 0, 100, 0] }, monochrome: false }, true],
};

function default_params(kind) {
	if (kind == 'levels') {
		var values = {};
		['rgb', 'r', 'g', 'b'].forEach(function (c) { values[c] = [0, 1, 255, 0, 255]; });
		return { values: values };
	}
	if (kind == 'curves') {
		var points = {};
		['rgb', 'r', 'g', 'b'].forEach(function (c) { points[c] = [[0, 0], [255, 255]]; });
		return { points: points };
	}
	if (kind == 'gradient_map') {
		return { color1: config.COLOR || '#000000', color2: config.BG_COLOR || '#ffffff', reverse: false };
	}
	return JSON.parse(JSON.stringify(KINDS[kind][1]));
}

function with_kind(kind, values) {
	return Object.assign({ kind: kind }, JSON.parse(JSON.stringify(values)));
}

/**
 * Layer > New Adjustment Layer: non-destructive adjustments, editable any time
 * (double click the layer), with a mask made from the selection
 */
class Layer_adjustment_class {

	constructor() {
		this.Adjust = new Image_adjust_class();
		this.Selection = new Pixel_selection_class();
	}

	brightness_contrast() { this.create('brightness_contrast'); }
	levels() { this.create('levels'); }
	curves() { this.create('curves'); }
	hue_saturation() { this.create('hue_saturation'); }
	black_white() { this.create('black_white'); }
	color_balance() { this.create('color_balance'); }
	selective_color() { this.create('selective_color'); }
	gradient_map() { this.create('gradient_map'); }
	color_lookup() { this.create('color_lookup'); }
	exposure() { this.create('exposure'); }
	vibrance() { this.create('vibrance'); }
	photo_filter() { this.create('photo_filter'); }
	channel_mixer() { this.create('channel_mixer'); }
	invert() { this.create('invert'); }

	count(kind) {
		return config.layers.filter(function (l) {
			return l.type == 'adjustment' && l.params && l.params.kind == kind;
		}).length + 1;
	}

	/**
	 * mask = selection (white inside), or white everywhere
	 */
	make_mask() {
		var mask = create_mask(this.Selection.has() ? 0 : 255);
		if (this.Selection.has()) {
			var white = document.createElement('canvas');
			white.width = config.WIDTH;
			white.height = config.HEIGHT;
			var wctx = white.getContext('2d');
			wctx.fillStyle = '#ffffff';
			wctx.fillRect(0, 0, white.width, white.height);
			wctx.globalCompositeOperation = 'destination-in';
			wctx.drawImage(this.Selection.mask, 0, 0);
			mask.canvas.getContext('2d').drawImage(white, 0, 0);
		}
		return mask;
	}

	settings(kind, params, mask) {
		return {
			type: 'adjustment',
			name: KINDS[kind][0] + ' ' + this.count(kind),
			x: 0,
			y: 0,
			width: config.WIDTH,
			height: config.HEIGHT,
			width_original: config.WIDTH,
			height_original: config.HEIGHT,
			hide_selection_if_active: true,
			params: with_kind(kind, params),
			_mask: mask,
			_mask_editing: true,
		};
	}

	/**
	 * inserts layer above active one, as one history step
	 */
	async insert(kind, params, mask) {
		var actions = [];
		var active = config.layer;
		var new_id = app.Layers.auto_increment;
		actions.push(new app.Actions.Insert_layer_action(this.settings(kind, params, mask), false));
		if (active) {
			var above = config.layers.filter(function (l) { return l.order > active.order; }).length;
			for (var i = 0; i < above; i++) {
				actions.push(new app.Actions.Reorder_layer_action(new_id, -1));
			}
		}
		if (this.Selection.has()) {
			actions.push(new Set_pixel_selection_action(null, '선택 해제'));
		}
		await app.State.do_action(new app.Actions.Bundle_action('adjustment_layer', KINDS[kind][0] + ' 조정 레이어', actions));
	}

	async create(kind) {
		if (!config.WIDTH || !config.HEIGHT) return;
		var _this = this;
		var mask = this.make_mask();
		if (!KINDS[kind][2]) {
			await this.insert(kind, default_params(kind), mask);
			return;
		}
		var source = render_all_doc().getContext('2d', { willReadFrequently: true })
			.getImageData(0, 0, config.WIDTH, config.HEIGHT).data;

		//preview layer outside history while dialog is open
		var temp = new app.Actions.Insert_layer_action(this.settings(kind, default_params(kind), mask), false);
		var prev_layer = config.layer;
		await temp.do();
		var layer = config.layer;
		var remove_temp = async function () {
			await temp.undo();
			temp.free();
			if (prev_layer && app.Layers.get_layer(prev_layer.id)) {
				config.layer = app.Layers.get_layer(prev_layer.id);
			}
			config.need_render = true;
		};
		this.Adjust.edit_layer(kind, {
			params: null,
			source: source,
			on_change: function (params) {
				layer._adj_off = params == null;
				if (params) layer.params = with_kind(kind, params);
				config.need_render = true;
			},
			on_ok: async function (params) {
				await remove_temp();
				await _this.insert(kind, params, mask);
			},
			on_cancel: remove_temp,
		});
	}

	/**
	 * opens dialog to change settings of adjustment layer
	 */
	edit(layer) {
		//menu passes an event, layers panel passes the layer
		layer = layer && layer.params ? layer : config.layer;
		if (!layer || layer.type != 'adjustment' || !layer.params) return;
		var kind = layer.params.kind;
		if (!KINDS[kind]) return;
		if (!KINDS[kind][2]) {
			alertify.message(KINDS[kind][0] + ' 조정에는 설정할 값이 없습니다.');
			return;
		}
		var original = layer.params;
		var restore = function () {
			layer.params = original;
			layer._adj_off = false;
			config.need_render = true;
		};
		//histogram of what is below this layer
		var hidden = [];
		config.layers.forEach(function (l) {
			if (l.order >= layer.order && l.visible) {
				hidden.push(l);
				l.visible = false;
			}
		});
		var source = render_all_doc().getContext('2d', { willReadFrequently: true })
			.getImageData(0, 0, config.WIDTH, config.HEIGHT).data;
		hidden.forEach(function (l) { l.visible = true; });

		this.Adjust.edit_layer(kind, {
			params: original,
			source: source,
			on_change: function (params) {
				layer._adj_off = params == null;
				if (params) layer.params = with_kind(kind, params);
				config.need_render = true;
			},
			on_ok: function (params) {
				restore();
				var next = with_kind(kind, params);
				if (JSON.stringify(next) == JSON.stringify(original)) return;
				var action = new app.Actions.Update_layer_action(layer.id, { params: next });
				action.action_description = KINDS[kind][0] + ' 수정';
				app.State.do_action(action);
			},
			on_cancel: restore,
		});
	}
}

export default Layer_adjustment_class;
