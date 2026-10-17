import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Base_gui_class from './../../core/base-gui.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import filesaver from './../../../../node_modules/file-saver/dist/FileSaver.min.js';
import { readPsd, writePsd } from 'ag-psd';
import { create_mask } from './../../core/layer-mask.js';
import { mark_saved } from './../../core/documents.js';

var instance = null;

// PSD blend mode <-> canvas globalCompositeOperation
const BLEND_FROM_PSD = {
	'normal': 'source-over',
	'pass through': 'source-over',
	'dissolve': 'ps-dissolve',
	'multiply': 'multiply',
	'screen': 'screen',
	'overlay': 'overlay',
	'darken': 'darken',
	'lighten': 'lighten',
	'color dodge': 'color-dodge',
	'color burn': 'color-burn',
	'linear dodge': 'lighter',
	'hard light': 'hard-light',
	'soft light': 'soft-light',
	'difference': 'difference',
	'exclusion': 'exclusion',
	'hue': 'hue',
	'saturation': 'saturation',
	'color': 'color',
	'luminosity': 'luminosity',
	'darker color': 'ps-darker-color',
	'lighter color': 'ps-lighter-color',
	'linear burn': 'ps-linear-burn',
	'vivid light': 'ps-vivid-light',
	'linear light': 'ps-linear-light',
	'pin light': 'ps-pin-light',
	'hard mix': 'ps-hard-mix',
	'subtract': 'ps-subtract',
	'divide': 'ps-divide',
};
const BLEND_TO_PSD = {};
for (const psd_mode in BLEND_FROM_PSD) {
	if (BLEND_TO_PSD[BLEND_FROM_PSD[psd_mode]] === undefined) {
		BLEND_TO_PSD[BLEND_FROM_PSD[psd_mode]] = psd_mode;
	}
}

/**
 * Photoshop PSD import / export (RGB, 8 bit), based on ag-psd.
 */
class File_psd_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
	}

	is_psd(file) {
		return /\.(psd|psb)$/i.test(file.name);
	}

	async open_file(file) {
		this.save_name = file.name.replace(/\.[^.]+$/, '');
		var buffer = await file.arrayBuffer();
		var psd;
		try {
			psd = readPsd(buffer, { skipThumbnail: true });
		}
		catch (e) {
			console.error(e);
			alertify.error('PSD 파일을 읽을 수 없습니다: ' + e.message);
			return;
		}

		//flatten groups, bottom layer first
		var layers = [];
		this.collect_layers(psd.children || [], layers, false, 1);

		//no layer data - use merged image
		if (layers.length == 0 && psd.canvas) {
			layers.push({ name: file.name, canvas: psd.canvas, left: 0, top: 0, opacity: 1, hidden: false, blendMode: 'normal' });
		}

		const actions = [];
		await this.Base_gui.GUI_preview.zoom(100);
		actions.push(
			new app.Actions.Refresh_action_attributes_action('undo'),
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ ZOOM: 1, WIDTH: psd.width, HEIGHT: psd.height }),
			new app.Actions.Reset_layers_action(),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Refresh_action_attributes_action('do')
		);

		for (const item of layers) {
			var width = item.canvas.width;
			var height = item.canvas.height;
			if (width == 0 || height == 0) {
				continue;
			}
			actions.push(new app.Actions.Insert_layer_action({
				name: item.name || 'Layer',
				type: 'image',
				data: item.canvas.toDataURL('image/png'),
				x: item.left || 0,
				y: item.top || 0,
				width: width,
				height: height,
				width_original: width,
				height_original: height,
				visible: !item.hidden,
				opacity: Math.round(item.opacity * 100),
				composition: BLEND_FROM_PSD[item.blendMode] || 'source-over',
				_mask: this.import_mask(item.mask, psd.width, psd.height),
			}, false));
		}
		actions.push(
			new app.Actions.Update_config_action({ WIDTH: psd.width, HEIGHT: psd.height }),
			new app.Actions.Prepare_canvas_action('do')
		);

		await app.State.do_action(
			new app.Actions.Bundle_action('open_psd_file', 'Open PSD File', actions)
		);
		alertify.success('PSD 열기 완료: 레이어 ' + layers.length + '개');
	}

	/**
	 * PSD mask (cropped, own position) -> document-sized mask
	 */
	import_mask(mask, width, height) {
		if (!mask || !mask.canvas) return undefined;
		var result = create_mask(mask.defaultColor || 0, width, height);
		result.canvas.getContext('2d').drawImage(mask.canvas, mask.left || 0, mask.top || 0);
		result.enabled = !mask.disabled;
		return result;
	}

	collect_layers(children, result, parent_hidden, parent_opacity) {
		for (const layer of children) {
			var hidden = parent_hidden || !!layer.hidden;
			var opacity = parent_opacity * (layer.opacity === undefined ? 1 : layer.opacity);
			if (layer.children) {
				this.collect_layers(layer.children, result, hidden, opacity);
			}
			else if (layer.canvas) {
				result.push({
					name: layer.name,
					canvas: layer.canvas,
					left: layer.left,
					top: layer.top,
					hidden: hidden,
					opacity: opacity,
					blendMode: layer.blendMode,
					mask: layer.mask,
				});
			}
		}
	}

	save() {
		if (config.layers.length == 0) {
			return;
		}
		var children = [];

		//bottom layer first
		var layers = this.Base_layers.get_sorted_layers().reverse();
		for (const layer of layers) {
			if (layer.type == null) {
				continue;
			}
			var rendered = this.render_layer(layer);
			if (rendered == null) {
				continue;
			}
			var child = {
				name: layer.name,
				left: rendered.left,
				top: rendered.top,
				canvas: rendered.canvas,
				hidden: !layer.visible,
				opacity: layer.opacity / 100,
				blendMode: BLEND_TO_PSD[layer.composition] || 'normal',
			};
			if (layer._mask) {
				child.mask = {
					top: 0, left: 0, bottom: config.HEIGHT, right: config.WIDTH,
					defaultColor: 255,
					disabled: layer._mask.enabled === false,
					canvas: layer._mask.canvas,
				};
			}
			children.push(child);
		}

		//merged preview, used by apps that can not read layers
		var merged = document.createElement('canvas');
		merged.width = config.WIDTH;
		merged.height = config.HEIGHT;
		this.Base_layers.convert_layers_to_canvas(merged.getContext('2d'), null, false);

		var buffer;
		try {
			buffer = writePsd({
				width: config.WIDTH,
				height: config.HEIGHT,
				canvas: merged,
				children: children,
			}, { generateThumbnail: true });
		}
		catch (e) {
			console.error(e);
			alertify.error('PSD 저장 실패: ' + e.message);
			return;
		}
		filesaver.saveAs(new Blob([buffer], { type: 'application/octet-stream' }), (this.save_name || 'image') + '.psd'); mark_saved();
	}

	/**
	 * Renders single layer (any type: image, text, shape...) at document coordinates,
	 * then trims transparent borders.
	 */
	render_layer(layer) {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		this.Base_layers.render_object(ctx, Object.assign({}, layer, { visible: true, _mask: null }));

		var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		var min_x = canvas.width, min_y = canvas.height, max_x = -1, max_y = -1;
		for (var y = 0; y < canvas.height; y++) {
			for (var x = 0; x < canvas.width; x++) {
				if (data[(y * canvas.width + x) * 4 + 3] !== 0) {
					if (x < min_x) min_x = x;
					if (x > max_x) max_x = x;
					if (y < min_y) min_y = y;
					if (y > max_y) max_y = y;
				}
			}
		}
		if (max_x < 0) {
			return null;
		}
		var w = max_x - min_x + 1;
		var h = max_y - min_y + 1;
		var trimmed = document.createElement('canvas');
		trimmed.width = w;
		trimmed.height = h;
		trimmed.getContext('2d').drawImage(canvas, min_x, min_y, w, h, 0, 0, w, h);
		return { canvas: trimmed, left: min_x, top: min_y };
	}
}

export default File_psd_class;
