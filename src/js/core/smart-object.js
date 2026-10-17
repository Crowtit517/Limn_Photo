/*
 * Smart objects (Photoshop): layer keeps its original pixels (smart.source) and a list of
 * smart filters; filters can be turned off, changed or removed later.
 * smart = { source: surface, filters: [{ op, kind|name, params, title, enabled }] }
 */
import app from './../app.js';
import config from './../config.js';
import { make_surface } from './layer-surface.js';
import { build_adjustment } from './../modules/image/adjust.js';
import { camera_raw_process } from './../modules/image/camera_raw.js';
import { filter_process } from './../modules/image/filters.js';
import { hooks } from './../libs/live-adjust.js';

export function step_process(step) {
	if (step.op == 'adjust') return build_adjustment(step.kind, step.params);
	if (step.op == 'camera_raw') return camera_raw_process(step.params);
	if (step.op == 'filter') return filter_process(step.name, step.params);
	return function (src, dst) { dst.set(src); };
}

/**
 * source pixels with all enabled smart filters applied
 */
export function render_smart(smart) {
	var source = smart.source;
	var canvas = document.createElement('canvas');
	canvas.width = source.width;
	canvas.height = source.height;
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(source, 0, 0);
	var steps = (smart.filters || []).filter(function (f) { return f.enabled !== false; });
	if (!steps.length) return canvas;
	var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var src = image.data;
	var dst = new Uint8ClampedArray(src.length);
	steps.forEach(function (step) {
		step_process(step)(src, dst, canvas.width, canvas.height);
		var tmp = src;
		src = dst;
		dst = tmp;
	});
	image.data.set(src);
	ctx.putImageData(image, 0, 0);
	return canvas;
}

/**
 * history actions that set new smart filter list and refresh layer pixels
 */
export function smart_actions(layer, filters, extra) {
	var smart = Object.assign({}, layer.smart, { filters: filters }, extra || {});
	return [
		new app.Actions.Update_layer_image_action(render_smart(smart), layer.id),
		new app.Actions.Update_layer_action(layer.id, { smart: smart }),
	];
}

/**
 * filters / adjustments on a smart object become smart filters (returns true when handled)
 */
export function apply_as_smart_filter(layer, step) {
	if (!layer || !layer.smart || !step) return false;
	var filters = (layer.smart.filters || []).concat([Object.assign({ enabled: true }, JSON.parse(JSON.stringify(step)))]);
	app.State.do_action(new app.Actions.Bundle_action('smart_filter', '고급 필터: ' + (step.title || ''), smart_actions(layer, filters)));
	return true;
}

export function to_smart_object(layer) {
	var smart = { source: make_surface(layer.link, layer.width_original || layer.link.width, layer.height_original || layer.link.height), filters: [] };
	var action = new app.Actions.Update_layer_action(layer.id, { smart: smart });
	action.action_description = '스마트 오브젝트로 변환';
	return app.State.do_action(action);
}

export function is_smart(layer) {
	return !!(layer && layer.smart && layer.type == 'image');
}

hooks.smart = apply_as_smart_filter;

export { config };
