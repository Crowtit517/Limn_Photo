import app from './../app.js';
import config from './../config.js';
import Base_layers_class from './base-layers.js';
import { Update_mask_action, clone_mask_canvas } from './layer-mask.js';
import Pixel_selection_class from './pixel-selection.js';
import { pixel_stamp, make_surface } from './layer-surface.js';

// Tools that change layer pixels directly; with a selection, pixels outside it are restored afterwards
const IN_PLACE_TOOLS = ['erase', 'magic_erase', 'clone', 'blur', 'sharpen', 'desaturate', 'bulge_pinch', 'fill',
	'dodge', 'burn', 'sponge', 'smudge'];

// Tools whose result gets painted into the active layer, like in raster painting apps.
// Multi-click tools (bezier, polygon) and text keep their own layers.
const PAINT_TOOLS = [
	'brush', 'pencil', 'gradient', 'fill',
	'arrow', 'callout', 'cog', 'cylinder', 'ellipse', 'heart', 'hexagon', 'human', 'line',
	'moon', 'parallelogram', 'pentagon', 'plus', 'rectangle', 'right_triangle', 'romb',
	'star', 'tear', 'trapezoid', 'triangle', 'regular_polygon',
];

var instance = null;

/**
 * Paints the output of drawing tools into the active layer instead of
 * leaving one new layer per stroke. The merge joins the tool's own history
 * entry, so one undo removes the whole stroke.
 */
class Raster_commit_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Selection = new Pixel_selection_class();
		this.armed = null;
		this.inplace = null;
		this.events();
	}

	events() {
		var _this = this;
		var start = function (event) {
			_this.arm(event);
		};
		var end = function () {
			_this.stroke_ended();
		};
		// capture phase: runs before the tool creates its layer
		document.addEventListener('mousedown', start, true);
		document.addEventListener('touchstart', start, true);
		//new stroke layer is shown clipped to selection while painting
		document.addEventListener('mousemove', function () {
			var armed = _this.armed;
			if (!armed || !config.layer || armed.known_ids.includes(config.layer.id) || config.layer._clip_selection) return;
			if (_this.Selection.has()) config.layer._clip_selection = true;
		}, true);
		// bubble phase, registered after tools: runs after the tool
		document.addEventListener('mouseup', end);
		document.addEventListener('touchend', end);
	}

	/**
	 * after the tool's mouseup. Tools that swallow mouseup (drag helpers) call this themselves.
	 */
	stroke_ended() {
		var _this = this;
		//let the tool finish its own mouseup handling first
		if (!this.armed && !this.inplace) return;
		//undo waits for this stroke to be stored
		app.State.busy++;
		setTimeout(function () {
			Promise.all([_this.commit(), _this.commit_inplace()]).finally(function () {
				app.State.busy--;
			});
		}, 0);
	}

	is_paintable(layer) {
		return layer != null && (layer.type == null || (layer.type == 'image' && !layer.is_vector));
	}

	arm(event) {
		this.armed = null;
		if (!config.TOOL || (event.target.closest && !event.target.closest('#main_wrapper'))) {
			return;
		}
		if (event.button !== undefined && event.button !== 0) {
			return;
		}
		if (this.arm_inplace()) {
			return;
		}
		if (config.DRAW_ON_LAYER === false || !PAINT_TOOLS.includes(config.TOOL.name)) {
			return;
		}
		if (!this.is_paintable(config.layer) && !this.is_mask_target(config.layer)) {
			return;
		}
		var conversion = null;
		if (config.layer.type == null && !this.is_mask_target(config.layer)) {
			//empty layer would be replaced by the tool's new layer - turn it into transparent raster first
			conversion = this.make_raster(config.layer);
		}
		this.armed = {
			target_id: config.layer.id,
			known_ids: config.layers.map(function (layer) { return layer.id; }),
			history_index: app.State.action_history_index,
			conversion: conversion,
		};
	}

	/**
	 * remembers layer pixels before an in-place tool runs inside a selection
	 */
	arm_inplace() {
		var layer = config.layer;
		if (!IN_PLACE_TOOLS.includes(config.TOOL.name) || !layer || layer.type != 'image' || !layer.link
			|| this.is_mask_target(layer) || !this.Selection.has()) {
			return false;
		}
		var source = layer.link_canvas != null ? layer.link_canvas : layer.link;
		var snapshot = document.createElement('canvas');
		snapshot.width = layer.width_original || source.width;
		snapshot.height = layer.height_original || source.height;
		snapshot.getContext('2d').drawImage(source, 0, 0);
		layer._sel_snapshot = snapshot;
		this.inplace = { layer: layer, snapshot: snapshot, history_index: app.State.action_history_index, src: pixel_stamp(layer) };
		return true;
	}

	async commit_inplace() {
		var job = this.inplace;
		this.inplace = null;
		if (!job) return;
		var layer = job.layer;
		var state = app.State;
		//wait until the tool stored its result
		var stored = false;
		for (var tries = 0; tries < 150; tries++) {
			stored = pixel_stamp(layer) != job.src && layer.link.complete && layer.link_canvas == null
				&& state.action_history_index > job.history_index;
			if (stored) break;
			await new Promise(function (resolve) { setTimeout(resolve, 20); });
		}
		if (!stored || !config.layers.includes(layer)) {
			delete layer._sel_snapshot;
			config.need_render = true;
			return;
		}
		var mask = this.Selection.mask_for_layer(layer);
		var current = document.createElement('canvas');
		current.width = job.snapshot.width;
		current.height = job.snapshot.height;
		current.getContext('2d').drawImage(layer.link, 0, 0);
		var out = mask ? this.Selection.blend(job.snapshot, current, mask) : current;
		layer.link_canvas = out;
		delete layer._sel_snapshot;
		var tool_index = state.action_history_index - 1;
		var action = new app.Actions.Update_layer_image_action(out, layer.id);
		var result = await state.do_action(action);
		if (result.status == 'completed') {
			var history = state.action_history;
			var own_index = history.lastIndexOf(action);
			if (own_index == tool_index + 1 && tool_index >= job.history_index && state.action_history_index == history.length) {
				history.splice(own_index, 1);
				history[tool_index] = new app.Actions.Bundle_action(history[tool_index].action_id,
					history[tool_index].action_description, [history[tool_index], action]);
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

	/**
	 * history entry (made after mousedown) that inserted given layer
	 */
	find_insert_entry(from_index, layer_id) {
		var history = app.State.action_history;
		var contains = function (action) {
			if (action.inserted_layer_id == layer_id) return true;
			return (action.actions_to_do || []).some(contains);
		};
		for (var i = Math.max(0, from_index - 1); i < app.State.action_history_index; i++) {
			if (contains(history[i])) {
				return history[i];
			}
		}
		return null;
	}

	async commit() {
		var armed = this.armed;
		this.armed = null;
		if (armed == null) {
			return;
		}
		//tool's layer insert is async and can finish after mouseup (first stroke, slow storage)
		var temp = null;
		for (var tries = 0; tries < 100; tries++) {
			if (this.armed != null) {
				//next stroke already started - do not grab its layer
				return;
			}
			var current = config.layer;
			if (current && !armed.known_ids.includes(current.id) && current.status != 'draft') {
				temp = current;
				break;
			}
			await new Promise(function (resolve) { setTimeout(resolve, 10); });
		}
		if (temp == null) {
			return;
		}
		if (this.Selection.has()) {
			temp._clip_selection = true;
		}
		var target = config.layers.find(function (layer) { return layer.id == armed.target_id; });
		if (!target || (!this.is_paintable(target) && !this.is_mask_target(target))) {
			console.warn('Paint on layer skipped: target layer missing or not raster', armed.target_id);
			return;
		}
		var state = app.State;
		var tool_action = this.find_insert_entry(armed.history_index, temp.id);
		if (!tool_action) {
			console.warn('Paint on layer skipped: history entry not found', armed.history_index, temp.id);
			return;
		}

		var merged = null;
		var merge_action;
		if (this.is_mask_target(target)) {
			//paint goes into layer mask as grayscale
			merge_action = new app.Actions.Bundle_action('paint_on_mask', 'Paint on Mask', [
				new app.Actions.Delete_layer_action(temp.id, true),
				new app.Actions.Select_layer_action(target.id, true),
				new Update_mask_action(target.id, { canvas: this.render_mask(target, temp), enabled: target._mask.enabled }),
			]);
		}
		else {
			//merged pixels are shown at once through link_canvas, so the next stroke
			//can start before the slow image encoding below has finished
			merged = this.render_merged(target, temp);
			target.link_canvas = merged;
			merge_action = new app.Actions.Bundle_action('paint_on_layer', 'Paint on Layer',
				this.build_merge_actions(target, temp, merged));
		}
		var result = await state.do_action(merge_action);

		if (result.status == 'completed') {
			//join merge into the tool's history entry: one undo = one stroke
			var history = state.action_history;
			var merge_index = history.lastIndexOf(merge_action);
			//look up again: tool may have replaced its entry meanwhile
			tool_action = this.find_insert_entry(armed.history_index, temp.id) || tool_action;
			var tool_index = history.indexOf(tool_action);
			if (merge_index >= 0 && tool_index >= 0 && tool_index < merge_index
				&& state.action_history_index == history.length) {
				history.splice(merge_index, 1);
				//empty -> raster conversion belongs to the stroke too (redo after undoing the new layer)
				history[tool_index] = new app.Actions.Bundle_action(tool_action.action_id,
					tool_action.action_description, [armed.conversion, tool_action, merge_action].filter(Boolean));
				state.action_history_index--;
			}
		}

		if (merged == null) {
			return;
		}
		//drop preview canvas once real image is loaded
		var link = target.link;
		if (link && !link.complete) {
			await new Promise(function (resolve) {
				link.addEventListener('load', resolve, { once: true });
				link.addEventListener('error', resolve, { once: true });
			});
		}
		if (target.link_canvas === merged) {
			delete target.link_canvas;
			config.need_render = true;
		}
	}

	is_mask_target(layer) {
		return layer != null && layer._mask != null && layer._mask_editing === true;
	}

	/**
	 * new mask canvas = old mask + stroke converted to gray
	 */
	render_mask(target, temp) {
		var canvas = clone_mask_canvas(target._mask);
		var ctx = canvas.getContext('2d');
		ctx.filter = 'grayscale(1)';
		ctx.globalAlpha = temp.opacity / 100;
		this.Base_layers.render_object(ctx, Object.assign({}, temp, { visible: true, status: null, _mask: null }));
		ctx.filter = 'none';
		ctx.globalAlpha = 1;
		return canvas;
	}

	render_merged(target, temp) {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		if (target.type == 'image') {
			//pixels only - mask stays separate
			this.Base_layers.render_object(ctx, Object.assign({}, target, { visible: true, _mask: null }));
		}
		ctx.globalAlpha = temp.opacity / 100;
		this.Base_layers.render_object(ctx, Object.assign({}, temp, { visible: true, status: null }));
		ctx.globalAlpha = 1;
		return canvas;
	}

	/**
	 * Actions that paint temp layer into target layer and remove temp layer.
	 * Result is a document-sized raster layer.
	 */
	build_merge_actions(target, temp, merged) {
		var width = config.WIDTH;
		var height = config.HEIGHT;
		//fast actions first: they finish before the next mouse event arrives
		var actions = [
			new app.Actions.Delete_layer_action(temp.id, true),
			new app.Actions.Select_layer_action(target.id, true),
		];
		if (target.x != 0 || target.y != 0 || target.width != width || target.height != height
			|| target.width_original != width || target.height_original != height || target.rotate) {
			actions.push(new app.Actions.Update_layer_action(target.id, {
				x: 0, y: 0, width: width, height: height,
				width_original: width, height_original: height, rotate: 0,
			}));
		}
		actions.push(new app.Actions.Update_layer_image_action(merged, target.id));
		return actions;
	}

	/**
	 * Converts empty layer into blank document-sized raster layer.
	 * Not recorded in history: visually nothing changes.
	 */
	make_raster(layer) {
		var width = config.WIDTH;
		var height = config.HEIGHT;
		var link = make_surface(null, width, height);
		//applied right away (the tool reads the layer on this mousedown), undo / redo through the stroke's history entry
		var action = new app.Actions.Update_layer_action(layer.id, {
			type: 'image', link: link, is_vector: false, x: 0, y: 0, rotate: 0,
			width: width, height: height, width_original: width, height_original: height,
		});
		action.do();
		return action;
	}

	blank_data_url(width, height) {
		var canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas.toDataURL('image/png');
	}
}

export default Raster_commit_class;
