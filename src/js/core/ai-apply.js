/*
 * Applies AI results to layers with undo support (shared by spot healing brush,
 * content-aware fill and object selection).
 */
import app from './../app.js';
import config from './../config.js';
import { new_canvas } from './pixel-selection.js';
import { inpaint } from './ai.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { pixel_stamp } from './layer-surface.js';

export function render_layer_doc(layer) {
	var canvas = new_canvas();
	if (layer && layer.type) {
		app.Layers.render_object(canvas.getContext('2d'),
			Object.assign({}, layer, { visible: true, _mask: null, _sel_snapshot: null }));
	}
	return canvas;
}

export function render_all_doc() {
	var canvas = new_canvas();
	app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
	return canvas;
}

/**
 * key that changes when pixels used for AI analysis change
 */
export function pixels_key(sample_all) {
	var layers = sample_all ? config.layers : [config.layer];
	return config.WIDTH + 'x' + config.HEIGHT + '|' + layers.map(function (l) {
		if (!l) return '';
		return [l.id, l.visible, l.opacity, l.composition, l.x, l.y, l.width, l.height,
			pixel_stamp(l), l.data ? JSON.stringify(l.data).length : 0].join(':');
	}).join('|');
}

/**
 * grows mask by pixels (covers anti-aliased edges of the removed object)
 */
export function dilate(mask, pixels) {
	var out = new_canvas(mask.width, mask.height);
	var ctx = out.getContext('2d', { willReadFrequently: true });
	ctx.filter = 'blur(' + pixels + 'px)';
	ctx.drawImage(mask, 0, 0);
	ctx.filter = 'none';
	var image = ctx.getImageData(0, 0, out.width, out.height);
	var data = image.data;
	for (var i = 0; i < data.length; i += 4) {
		var on = data[i + 3] > 6;
		data[i] = data[i + 1] = data[i + 2] = 255;
		data[i + 3] = on ? 255 : 0;
	}
	ctx.putImageData(image, 0, 0);
	return out;
}

/**
 * fills mask area of the active layer with AI generated content
 */
export async function heal_layer(mask, sample_all, description, expand) {
	if (expand) {
		mask = dilate(mask, expand);
	}
	var layer = config.layer;
	if (!layer || (layer.type != 'image' && !(layer.type == null && sample_all))) {
		alertify.error('래스터 레이어를 선택하세요.');
		return false;
	}
	var source = sample_all ? render_all_doc() : render_layer_doc(layer);
	var patch;
	try {
		patch = await inpaint(source, mask);
	}
	catch (e) {
		console.error(e);
		alertify.error('AI 처리에 실패했습니다: ' + (e && e.message ? e.message : e));
		return false;
	}
	if (!patch) return false;
	var out = render_layer_doc(layer);
	out.getContext('2d').drawImage(patch, 0, 0);

	var w = config.WIDTH, h = config.HEIGHT;
	var actions = [];
	if (layer.type == null) {
		actions.push(
			new app.Actions.Delete_layer_action(layer.id, true),
			new app.Actions.Insert_layer_action({
				name: layer.name, type: 'image', data: out.toDataURL('image/png'),
				x: 0, y: 0, width: w, height: h, width_original: w, height_original: h,
			}, false)
		);
	}
	else {
		if (layer.x != 0 || layer.y != 0 || layer.width != w || layer.height != h || layer.rotate) {
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0,
			}));
		}
		actions.push(new app.Actions.Update_layer_image_action(out, layer.id));
		layer.link_canvas = out;
	}
	await app.State.do_action(new app.Actions.Bundle_action('ai_heal', description, actions));
	if (layer.link) {
		var clear = function () {
			if (layer.link_canvas === out) {
				delete layer.link_canvas;
				config.need_render = true;
			}
		};
		if (layer.link.complete) clear();
		else layer.link.addEventListener('load', clear, { once: true });
	}
	return true;
}
