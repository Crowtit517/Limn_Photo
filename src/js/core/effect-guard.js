/*
 * Makes Effects / Filter menu commands respect the pixel selection, like Photoshop:
 * the effect is applied, then pixels outside the selection are restored.
 * Live (non-destructive) layer filters added by an effect are baked into pixels in that case.
 */
import app from './../app.js';
import config from './../config.js';
import Pixel_selection_class, { new_canvas } from './pixel-selection.js';
import { pixel_stamp } from './layer-surface.js';

// menu modules that change active layer pixels
const GUARDED = [
	/^effects\//,
	/^image\/(color_corrections|auto_adjust|decrease_colors)$/,
	/^tools\/(replace_color|color_to_alpha|restore_alpha)$/,
];

export function is_guarded(module) {
	return GUARDED.some(function (re) { return re.test(module); });
}

function dialog_open() {
	return document.querySelector('#popups .popup') != null || document.querySelector('.adj_dialog') != null;
}

function render_layer(layer) {
	var canvas = new_canvas();
	app.Layers.render_object(canvas.getContext('2d'),
		Object.assign({}, layer, { visible: true, _mask: null, _sel_snapshot: null }));
	return canvas;
}

/**
 * runs fn (menu command); if a selection exists, limits its result to the selection
 */
export async function run_guarded(fn) {
	var selection = new Pixel_selection_class();
	var layer = config.layer;
	if (!selection.has() || !layer || layer.type != 'image') {
		return fn();
	}
	var state = app.State;
	var before = render_layer(layer);
	var history_index = state.action_history_index;
	var src = pixel_stamp(layer);
	var filters = layer.filters.length;
	var mask = selection.mask;

	fn();

	//wait for the effect: dialogs can stay open as long as the user wants
	var closed_since = null;
	while (true) {
		await new Promise(function (resolve) { setTimeout(resolve, 60); });
		if (!config.layers.includes(layer)) return;
		var changed = state.action_history_index > history_index
			&& ((pixel_stamp(layer) != src && layer.link.complete && layer.link_canvas == null) || layer.filters.length != filters);
		if (changed && !dialog_open()) break;
		if (dialog_open()) {
			closed_since = null;
			continue;
		}
		if (closed_since == null) closed_since = Date.now();
		if (Date.now() - closed_since > 2500) return; //nothing applied
	}
	//let multi-step effects finish
	await new Promise(function (resolve) { setTimeout(resolve, 150); });

	var after = render_layer(layer);
	var out = selection.blend(before, after, mask);
	var w = config.WIDTH, h = config.HEIGHT;
	var actions = [];
	for (var filter of layer.filters.slice()) {
		actions.push(new app.Actions.Delete_layer_filter_action(layer.id, filter.id));
	}
	if (layer.x != 0 || layer.y != 0 || layer.width != w || layer.height != h || layer.rotate) {
		actions.push(new app.Actions.Update_layer_action(layer.id, {
			x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0,
		}));
	}
	actions.push(new app.Actions.Update_layer_image_action(out, layer.id));
	var effect_index = state.action_history_index - 1;
	var bundle = new app.Actions.Bundle_action('selection_limit', '선택 영역에 적용', actions);
	layer.link_canvas = out;
	var result = await state.do_action(bundle);
	if (result.status == 'completed') {
		//one undo removes the effect and this correction
		var history = state.action_history;
		var own = history.lastIndexOf(bundle);
		if (own == effect_index + 1 && effect_index >= history_index && state.action_history_index == history.length) {
			history.splice(own, 1);
			history[effect_index] = new app.Actions.Bundle_action(history[effect_index].action_id,
				history[effect_index].action_description, [history[effect_index], bundle]);
			state.action_history_index--;
		}
	}
	var clear = function () {
		if (layer.link_canvas === out) {
			delete layer.link_canvas;
			config.need_render = true;
		}
	};
	if (layer.link.complete) clear();
	else layer.link.addEventListener('load', clear, { once: true });
}
