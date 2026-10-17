/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from "./../app.js";
import config from "./../config.js";
import Base_gui_class from "./base-gui.js";
import Base_selection_class from "./base-selection.js";
import Image_trim_class from "./../modules/image/trim.js";
import View_ruler_class from "./../modules/view/ruler.js";
import zoomView from "./../libs/zoomView.js";
import { mask_alpha_canvas } from "./layer-mask.js";
import { gpu_adjustment } from './../modules/image/adjust.js';
import Pixel_selection_class from "./pixel-selection.js";
import { build_adjustment } from "./../modules/image/adjust.js";
import Helper_class from "./../libs/helpers.js";
import alertify from "./../../../node_modules/alertifyjs/build/alertify.min.js";
import { restore_surface, pixel_stamp } from './layer-surface.js';
import { is_custom_blend, apply_custom_blend } from "./../libs/blend-modes.js";
import { group_state } from "./../modules/layer/group.js";
import { has_styles, render_styled } from "./../libs/layer-styles.js";
import { apply_channel_view, draw_selected_path } from "./gui/doc-panels.js";
import { draw_warped } from "./gui/character-panel.js";

var instance = null;

/**
 * Layers class - manages layers. Each layer is object with various types. Keys:
 * - id (int)
 * - link (image)
 * - parent_id (int)
 * - name (string)
 * - type (string)
 * - x (int)
 * - y (int)
 * - width (int)
 * - height (int)
 * - width_original (int)
 * - height_original (int)
 * - visible (bool)
 * - is_vector (bool)
 * - hide_selection_if_active (bool)
 * - opacity (0-100)
 * - order (int)
 * - composition (string)
 * - rotate (int) 0-359
 * - data (various data here)
 * - params (object)
 * - color {hex}
 * - status (string)
 * - filters (array)
 * - render_function (function)
 */
//stable ids for canvases (cache keys)
var obj_ids = new WeakMap(), obj_next = 1;
function obj_id(obj) {
	if (!obj) return 0;
	var id = obj_ids.get(obj);
	if (!id) {
		id = obj_next++;
		obj_ids.set(obj, id);
	}
	return id;
}

class Base_layers_class {
	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.Image_trim = new Image_trim_class();
		this.View_ruler = new View_ruler_class();

		this.canvas = document.getElementById("canvas_minipaint");
		this.ctx = document.getElementById("canvas_minipaint").getContext("2d");
		this.ctx_preview = document
			.getElementById("canvas_preview")
			.getContext("2d");
		this.last_zoom = 1;
		this.auto_increment = 1;
		this.stable_dimensions = [];
		this.debug_rendering = false;
		this.render_success = null;
		this.disabled_filter_id = null;
	}

	/**
	 * do preparation on start
	 */
	init() {
		this.init_zoom_lib();

		new app.Actions.Insert_layer_action({}).do();

		var sel_config = {
			enable_background: false,
			enable_borders: true,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return config.layer;
			},
		};
		this.Base_selection = new Base_selection_class(
			this.ctx,
			sel_config,
			"main"
		);

		this.render(true);
	}

	init_zoom_lib() {
		zoomView.setBounds(0, 0, config.WIDTH, config.HEIGHT);
		zoomView.setContext(this.ctx);
		this.stable_dimensions = [config.WIDTH, config.HEIGHT];
	}

	pre_render() {
		this.ctx.save();
		zoomView.canvasDefault();
		this.ctx.clearRect(
			0,
			0,
			config.WIDTH * config.ZOOM,
			config.HEIGHT * config.ZOOM
		);
	}

	after_render() {
		config.need_render = false;
		config.need_render_changed_params = false;
		this.ctx.restore();
		zoomView.canvasDefault();
	}

	/**
	 * renders all layers objects on main canvas
	 *
	 * @param {bool} force
	 */
	render(force) {
		var _this = this;
		if (force !== true) {
			//request render and exit
			config.need_render = true;
			return;
		}

		if (
			this.stable_dimensions[0] != config.WIDTH ||
			this.stable_dimensions[1] != config.HEIGHT
		) {
			//dimensions changed - re-init zoom lib
			this.init_zoom_lib();
		}

		if (config.need_render == true) {
			this.render_success = null;

			if (this.debug_rendering === true) {
				console.log("Rendering...");
			}

			if (this.last_zoom != config.ZOOM) {
				//change zoom
				zoomView.scaleAt(
					this.Base_gui.GUI_preview.zoom_data.x,
					this.Base_gui.GUI_preview.zoom_data.y,
					config.ZOOM / this.last_zoom
				);
			} else if (this.Base_gui.GUI_preview.zoom_data.move_pos != null) {
				//move visible window
				var pos = this.Base_gui.GUI_preview.zoom_data.move_pos;
				var pos_global = zoomView.toScreen(pos);
				zoomView.move(-pos_global.x, -pos_global.y);
				this.Base_gui.GUI_preview.zoom_data.move_pos = null;
			}

			//prepare
			this.pre_render();

			//take data
			var layers_sorted = this.get_sorted_layers();

			zoomView.apply();

			const newCanvas = this.create_new_canvas(
				null,
				config.WIDTH,
				config.HEIGHT
			);

			this.render_objects(this.ctx, newCanvas, layers_sorted, ()=>{
				this.ctx.save();
			});

			//grid
			this.Base_gui.draw_grid(this.ctx);

			//guides
			this.Base_gui.draw_guides(this.ctx);

			//Channels panel: single channel view
			apply_channel_view(this.ctx);

			//render selected object controls
			this.Base_selection.draw_selection();
			draw_selected_path(this.ctx);

			//active tool overlay
			this.render_overlay();

			//marching ants follow view changes
			new Pixel_selection_class().draw_overlay();

			//render preview
			this.render_preview(layers_sorted);

			//reset
			this.after_render();

			this.last_zoom = config.ZOOM;

			//a panel problem must never stop canvas drawing
			try {
				this.Base_gui.GUI_details.render_details();
			}
			catch (e) {
				console.error(e);
			}
			this.View_ruler.render_ruler();

			if (this.render_success === false) {
				alertify.error("일부 레이어를 그리지 못했습니다.");
			}
		}

		requestAnimationFrame(function () {
			_this.render(force);
		});
	}

	render_overlay() {
		var render_class = config.TOOL.name;
		var render_function = "render_overlay";

		if (
			typeof this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			] != "undefined"
		) {
			this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			](this.ctx);
		}
	}

	/**
	 * LEGACY: use create_new_canvas();
	 */
	createNewCanvas(ctx, h, w) {
		this.create_new_canvas(ctx, w, h);
	}

	/**
	 * Creates a fresh new canvas with the same height and width as the provided one
	 * @param {canvas.context|null} ctx
	 * @param {number} [width]
	 * @param {number} [height]
	 */
	create_new_canvas(ctx, width, height) {
		const newCanvas = document.createElement("canvas");
		if(width){
			newCanvas.width = width;
		}
		else{
			newCanvas.width = ctx.canvas.width;
		}

		if(height){
			newCanvas.height = height;
		}
		else{
			newCanvas.height = ctx.canvas.height;
		}

		return newCanvas;
	}

	/**
	 * LEGACY: use render_objects()
	 */
	renderObjects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		this.render_objects(ctx, tempCanvas, layers, prepare, shouldSkip);
	}

	/**
	 * Renders objects based on the provided layers
	 * @param {canvas.context} ctx - Main canvas context where it needs to be rendered
	 * @param {canvas} tempCanvas - A temporary canvas which is a copy of the original canvas, but will be used if there will be needed to isolate an effect from others
	 * @param {Object[]} layers - Array of layers
	 * @param {Function} prepare - An optional function to prepare temporary and main canvases before the render if needed
	 * @param {Function} shouldSkip - An optional boolean function for skipping those layers which are not needed to be rendered
	 */
	render_objects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		const tempCtx = tempCanvas.getContext("2d");
		// Prepare the temporary canvas if needed
		prepare && prepare();
		
		for (var i = layers.length - 1; i >= 0; i--) {
			var layer = layers[i];
			const nextLayer = layers[i - 1];

			// If the previous layer has clip masking effect and the current one is not the other end of the pair,
			// then render the temporary canvas for clip masking on top of the current.
			
			// Skip the layer if not needed to be rendered
			if (shouldSkip && shouldSkip(layer)) {
				continue;
			}

			//layer groups: folders draw nothing, hide / fade their contents
			if (layer.type == 'group') {
				continue;
			}
			if (layer.fill_opacity != null && layer.fill_opacity < 100 && !has_styles(layer)) {
				layer = Object.assign({}, layer, { opacity: layer.opacity * layer.fill_opacity / 100 });
			}
			if (layer.parent_id) {
				var group = group_state(layer);
				if (!group.visible) continue;
				if (group.opacity < 1) {
					layer = Object.assign({}, layer, { opacity: layer.opacity * group.opacity });
				}
			}

			// If the layer or next layer has clip masking effect (source-atop).
			// If there are such layers, this will make sure that layers will be rendered
			// in an isolated temporary canvas
			if (
				layer.composition === "source-atop" ||
				(nextLayer && nextLayer.composition === "source-atop")
			) {
				// Apply the effect in a isolated temporary canvas
				tempCtx.globalAlpha = layer.opacity / 100;
				tempCtx.globalCompositeOperation = layer.composition;

				// If the next layer has the clip masking effect then
				// isolated the shadow filter from temporary canvas and keep that in the original canvas
				if (nextLayer?.composition === "source-atop") {
					// Render the layer
					this.render_object(ctx, layer);
					// Then remove the shadow (if it exists) from the render process in the temporary canvas
					const filters = layer.filters.filter((filter) => {
						return filter.name !== "shadow";
					});
					this.render_object(tempCtx, {
						...layer,
						filters,
					});
				} else {
					// If we are in this condition, then it means this is the last layer of clipped layers pair.
					// Render clipped layers on the temporary canvas
					this.render_object(tempCtx, layer);
					
					// Render the clipped layers on top of the current canvas
					ctx.restore();
					ctx.drawImage(tempCanvas, 0, 0);

					
					// Prepare canvas to since we called restore
					prepare && prepare();
					// Clear temporary canvas 
					tempCtx.globalCompositeOperation = null;
					tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
				}
			} else if (has_styles(layer)) {
				//layer styles: effects + content prepared in document space
				var styled = render_styled(this, layer);
				ctx.globalAlpha = layer.opacity / 100;
				ctx.globalCompositeOperation = is_custom_blend(layer.composition) ? 'source-over' : layer.composition;
				ctx.drawImage(styled, 0, 0);
			} else if (is_custom_blend(layer.composition)) {
				this.render_custom_blend(ctx, layer);
			} else {
				ctx.globalAlpha = layer.opacity / 100;
				ctx.globalCompositeOperation = layer.composition;
				this.render_object(ctx, layer);
			}
		}

	}

	render_preview(layers) {
		this.Base_gui.GUI_preview.fit_preview_size();
		var w = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
		var h = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;

		this.ctx_preview.save();
		this.ctx_preview.clearRect(0, 0, w, h);

		const newCanvas = this.create_new_canvas(this.ctx_preview);
		newCanvas.getContext("2d").scale(w / config.WIDTH, h / config.HEIGHT);
		this.render_objects(this.ctx_preview, newCanvas, layers, () => {
			this.ctx_preview.save();
			//prepare scale
			this.ctx_preview.scale(w / config.WIDTH, h / config.HEIGHT);
		});

		this.ctx_preview.restore();
		this.Base_gui.GUI_preview.render_preview_active_zone();
	}

	/**
	 * export current layers to given canvas
	 *
	 * @param {canvas.context} ctx
	 * @param {object} object
	 * @param {boolean} is_preview
	 */
	render_object(ctx, object, is_preview) {
		if (object.visible == false || object.type == null) return;

		if (object.type == 'group') return;

		//Warp Text: render text alone, then bend it column by column
		if (object.type == 'text' && object.text_warp && object.text_warp.style != 'none' && !object._warping) {
			var warp_buffer = this.warp_buffer || (this.warp_buffer = document.createElement('canvas'));
			if (warp_buffer.width != config.WIDTH || warp_buffer.height != config.HEIGHT) {
				warp_buffer.width = config.WIDTH;
				warp_buffer.height = config.HEIGHT;
			}
			var wctx = warp_buffer.getContext('2d');
			wctx.setTransform(1, 0, 0, 1, 0, 0);
			wctx.clearRect(0, 0, warp_buffer.width, warp_buffer.height);
			this.render_object(wctx, Object.assign({}, object, { _warping: true }), is_preview);
			draw_warped(ctx, warp_buffer, object);
			return;
		}

		//adjustment layer changes everything rendered below it
		if (object.type == 'adjustment') {
			this.render_adjustment(ctx, object);
			return;
		}

		//stroke being painted while a selection exists: show it only inside selection
		if (object._clip_selection) {
			var selection = new Pixel_selection_class();
			if (selection.has()) {
				var clip = this.get_clip_buffer();
				var cctx = clip.getContext('2d');
				cctx.setTransform(1, 0, 0, 1, 0, 0);
				cctx.globalAlpha = 1;
				cctx.globalCompositeOperation = 'source-over';
				cctx.clearRect(0, 0, clip.width, clip.height);
				this.render_object(cctx, Object.assign({}, object, { _clip_selection: false }), is_preview);
				cctx.globalCompositeOperation = 'destination-in';
				cctx.drawImage(selection.mask, 0, 0);
				cctx.globalCompositeOperation = 'source-over';
				ctx.drawImage(clip, 0, 0);
				return;
			}
		}

		//layer edited in place by a tool while a selection exists: outside selection keep old pixels
		if (object._sel_snapshot && object.type == 'image') {
			var selection2 = new Pixel_selection_class();
			var layer_mask = selection2.mask_for_layer(object);
			if (layer_mask) {
				var current = object.link_canvas != null ? object.link_canvas : object.link;
				if (current && (current.width || current.naturalWidth)) {
					var blended = selection2.blend(object._sel_snapshot, current, layer_mask);
					this.render_object(ctx, Object.assign({}, object, { _sel_snapshot: null, link_canvas: blended }), is_preview);
					return;
				}
			}
		}

		//layer mask: render isolated, cut with mask, then composite
		if (object._mask && object._mask.enabled !== false) {
			var buffer = this.get_mask_buffer();
			var bctx = buffer.getContext('2d');
			bctx.setTransform(1, 0, 0, 1, 0, 0);
			bctx.globalAlpha = 1;
			bctx.globalCompositeOperation = 'source-over';
			bctx.clearRect(0, 0, buffer.width, buffer.height);
			this.render_object(bctx, Object.assign({}, object, { _mask: null }), is_preview);
			bctx.globalCompositeOperation = 'destination-in';
			bctx.drawImage(mask_alpha_canvas(object._mask), 0, 0);
			bctx.globalCompositeOperation = 'source-over';
			ctx.drawImage(buffer, 0, 0);
			return;
		}

		this.pre_render_object(ctx, object);

		//example with canvas object - other types should overwrite this method
		if (object.type == "image" && object._ft) {
			//free transform in progress
			object._ft.draw(ctx);
		} else if (object.type == "image" && object.link_canvas == null && object.link && object.link._archived) {
			//compressed undo surface came back (undo of delete): decode, draw next frame
			restore_surface(object.link);
		} else if (object.type == "image" && object.link_canvas == null && object.link
			&& object.link.complete === true && !object.link.naturalWidth) {
			//broken image - skip instead of stopping the whole render
			this.render_success = false;
		} else if (object.type == "image") {
			//image - default behavior
			ctx.save();

			ctx.translate(object.x + object.width / 2, object.y + object.height / 2);
			ctx.rotate((object.rotate * Math.PI) / 180);
			// TODO - Not sure why the check should be with null,
			// if nothing will break, then better to check if it's just truthy
			ctx.drawImage(
				object.link_canvas != null ? object.link_canvas : object.link,
				-object.width / 2,
				-object.height / 2,
				object.width,
				object.height
			);

			ctx.restore();
		} else {
			//call render function from other module
			var render_class = object.render_function[0];
			var render_function = object.render_function[1];
			if (
				typeof this.Base_gui.GUI_tools.tools_modules[render_class] !=
				"undefined"
			) {
				this.Base_gui.GUI_tools.tools_modules[render_class].object[
					render_function
				](ctx, object, is_preview);
			} else {
				this.render_success = false;
				console.log("Error: unknown layer type: " + object.type);
			}
		}

		this.after_render_object(ctx, object);
	}

	/**
	 * Photoshop blend modes canvas lacks (linear light, pin light...): layer is drawn alone,
	 * then mixed with the backdrop pixel by pixel
	 */
	render_custom_blend(ctx, layer) {
		if (layer.visible == false || layer.type == null) return;
		var canvas = ctx.canvas;
		var w = canvas.width, h = canvas.height;
		if (!w || !h) return;
		var buffer = this.blend_buffer || (this.blend_buffer = document.createElement('canvas'));
		if (buffer.width != w || buffer.height != h) {
			buffer.width = w;
			buffer.height = h;
		}
		var bctx = buffer.getContext('2d', { willReadFrequently: true });
		bctx.setTransform(1, 0, 0, 1, 0, 0);
		bctx.globalAlpha = 1;
		bctx.globalCompositeOperation = 'source-over';
		bctx.clearRect(0, 0, w, h);
		bctx.setTransform(ctx.getTransform());
		bctx.globalAlpha = (layer.opacity == null ? 100 : layer.opacity) / 100;
		this.render_object(bctx, Object.assign({}, layer, { composition: 'source-over' }));
		var src = bctx.getImageData(0, 0, w, h).data;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		var image = ctx.getImageData(0, 0, w, h);
		apply_custom_blend(layer.composition, image.data, src);
		ctx.putImageData(image, 0, 0);
		ctx.restore();
	}

	/**
	 * applies adjustment layer to pixels already drawn on ctx (any canvas: view, preview, export),
	 * mixed by layer opacity and layer mask
	 */
	render_adjustment(ctx, layer) {
		if (!layer.params || !layer.params.kind || layer._adj_off) return;
		var canvas = ctx.canvas;
		var w = canvas.width, h = canvas.height;
		if (!w || !h) return;
		var key = JSON.stringify(layer.params);
		var processes = this.adjust_processes || (this.adjust_processes = new Map());
		var cache = processes.get(layer.id);
		if (!cache || cache.key !== key) {
			cache = { key: key, process: build_adjustment(layer.params.kind, layer.params) };
			processes.set(layer.id, cache);
		}
		var transform = ctx.getTransform();
		//same input as last time (nothing below changed, same view): reuse the result instead of
		//reading and processing every pixel again on each redraw
		var result_key = [key, obj_id(canvas), w, h, transform.a, transform.b, transform.c, transform.d, transform.e, transform.f,
			layer.opacity, layer._mask && layer._mask.enabled !== false ? obj_id(layer._mask.canvas) : '', this.below_signature(layer)].join('|');
		var results = this.adjust_results || (this.adjust_results = new Map());
		var result_slot = layer.id + ':' + obj_id(canvas);
		var stored = results.get(result_slot);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		if (stored && stored.key === result_key) {
			ctx.globalCompositeOperation = 'copy';
			ctx.drawImage(stored.canvas, 0, 0);
			ctx.restore();
			return;
		}
		//only the part of the screen where the document is (zoomed out: a small area)
		var corners = [[0, 0], [config.WIDTH, 0], [0, config.HEIGHT], [config.WIDTH, config.HEIGHT]].map(function (c) {
			return [transform.a * c[0] + transform.c * c[1] + transform.e, transform.b * c[0] + transform.d * c[1] + transform.f];
		});
		var rx = Math.max(0, Math.floor(Math.min.apply(null, corners.map(function (c) { return c[0]; }))));
		var ry = Math.max(0, Math.floor(Math.min.apply(null, corners.map(function (c) { return c[1]; }))));
		var rw = Math.min(w, Math.ceil(Math.max.apply(null, corners.map(function (c) { return c[0]; })))) - rx;
		var rh = Math.min(h, Math.ceil(Math.max.apply(null, corners.map(function (c) { return c[1]; })))) - ry;
		if (rw <= 0 || rh <= 0) {
			ctx.restore();
			return;
		}
		//simple adjustments (tables / color matrix) run on the GPU as an SVG filter
		var filter = this.gpu_filter(layer);
		if (filter) {
			var tmp = this.adjust_gpu_buffer || (this.adjust_gpu_buffer = document.createElement('canvas'));
			if (tmp.width != rw || tmp.height != rh) {
				tmp.width = rw;
				tmp.height = rh;
			}
			var tctx = tmp.getContext('2d');
			tctx.setTransform(1, 0, 0, 1, 0, 0);
			tctx.globalCompositeOperation = 'copy';
			tctx.filter = filter;
			tctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
			tctx.filter = 'none';
			if (layer._mask && layer._mask.enabled !== false) {
				tctx.globalCompositeOperation = 'destination-in';
				tctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e - rx, transform.f - ry);
				tctx.drawImage(mask_alpha_canvas(layer._mask), 0, 0);
				tctx.setTransform(1, 0, 0, 1, 0, 0);
			}
			tctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = (layer.opacity == null ? 100 : layer.opacity) / 100;
			//adjusted pixels over the original, but transparent stays transparent
			ctx.globalCompositeOperation = 'source-atop';
			ctx.drawImage(tmp, rx, ry);
			ctx.restore();
			this.store_adjust_result(stored, results, result_slot, canvas, w, h, result_key);
			return;
		}
		var image = ctx.getImageData(rx, ry, rw, rh);
		var src = image.data;
		var out = new Uint8ClampedArray(src.length);
		cache.process(src, out, rw, rh);

		var amount = (layer.opacity == null ? 100 : layer.opacity) / 100;
		var mask = null;
		if (layer._mask && layer._mask.enabled !== false) {
			var buffer = this.adjust_mask_buffer || (this.adjust_mask_buffer = document.createElement('canvas'));
			if (buffer.width != rw || buffer.height != rh) {
				buffer.width = rw;
				buffer.height = rh;
			}
			var mctx = buffer.getContext('2d', { willReadFrequently: true });
			mctx.setTransform(1, 0, 0, 1, 0, 0);
			mctx.clearRect(0, 0, rw, rh);
			mctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e - rx, transform.f - ry);
			mctx.drawImage(layer._mask.canvas, 0, 0);
			mask = mctx.getImageData(0, 0, rw, rh).data;
		}
		if (mask || amount < 1) {
			for (var i = 0; i < src.length; i += 4) {
				if (src[i + 3] == 0) continue;
				var k = mask ? amount * mask[i] / 255 : amount;
				if (k <= 0) continue;
				src[i] += (out[i] - src[i]) * k;
				src[i + 1] += (out[i + 1] - src[i + 1]) * k;
				src[i + 2] += (out[i + 2] - src[i + 2]) * k;
			}
		}
		else {
			src.set(out);
		}
		ctx.putImageData(image, rx, ry);
		ctx.restore();
		this.store_adjust_result(stored, results, result_slot, canvas, w, h, result_key);
	}

	store_adjust_result(stored, results, slot, canvas, w, h, key) {
		if (!stored) {
			stored = { canvas: document.createElement('canvas') };
			results.set(slot, stored);
		}
		if (stored.canvas.width != w || stored.canvas.height != h) {
			stored.canvas.width = w;
			stored.canvas.height = h;
		}
		var sctx = stored.canvas.getContext('2d');
		sctx.globalCompositeOperation = 'copy';
		sctx.drawImage(canvas, 0, 0);
		stored.key = key;
	}

	/**
	 * SVG filter (url(#id)) for an adjustment layer, built once per settings
	 */
	gpu_filter(layer) {
		if (config.BIT_DEPTH == 16) return null;
		var key = JSON.stringify(layer.params);
		var filters = this.gpu_filters || (this.gpu_filters = new Map());
		var known = filters.get(layer.id);
		if (known && known.key === key) return known.css;
		var spec = gpu_adjustment(layer.params.kind, layer.params);
		var css = null;
		if (spec) {
			var svg = document.getElementById('ws_gpu_filters');
			if (!svg) {
				svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				svg.id = 'ws_gpu_filters';
				svg.setAttribute('width', '0');
				svg.setAttribute('height', '0');
				svg.style.position = 'absolute';
				document.body.appendChild(svg);
			}
			var id = 'adjf_' + layer.id;
			var old = document.getElementById(id);
			if (old) old.remove();
			var ns = 'http://www.w3.org/2000/svg';
			var f = document.createElementNS(ns, 'filter');
			f.id = id;
			//pixel values as they are (sRGB), like the CPU path
			f.setAttribute('color-interpolation-filters', 'sRGB');
			f.setAttribute('x', '0');
			f.setAttribute('y', '0');
			f.setAttribute('width', '100%');
			f.setAttribute('height', '100%');
			if (spec.matrix) {
				var m = document.createElementNS(ns, 'feColorMatrix');
				m.setAttribute('type', 'matrix');
				m.setAttribute('values', spec.matrix.join(' '));
				f.appendChild(m);
			}
			if (spec.tables) {
				var t = document.createElementNS(ns, 'feComponentTransfer');
				['feFuncR', 'feFuncG', 'feFuncB'].forEach(function (name, i) {
					var fn = document.createElementNS(ns, name);
					fn.setAttribute('type', 'table');
					fn.setAttribute('tableValues', Array.from(spec.tables[i], function (v) { return (v / 255).toFixed(5); }).join(' '));
					t.appendChild(fn);
				});
				f.appendChild(t);
			}
			svg.appendChild(f);
			css = 'url(#' + id + ')';
		}
		filters.set(layer.id, { key: key, css: css });
		return css;
	}

	/**
	 * state of every layer drawn before this one (changes = adjustment must be computed again)
	 */
	below_signature(layer) {
		var parts = [];
		for (var i = 0; i < config.layers.length; i++) {
			var l = config.layers[i];
			if (l === layer || l.order >= layer.order) continue;
			parts.push([l.id, l.order, l.visible, l.opacity, l.composition, l.x, l.y, l.width, l.height, l.rotate, l.fill_opacity, l.status, l._adj_off,
				pixel_stamp(l), l.link_canvas ? 'p' + obj_id(l.link_canvas) + ':' + (l.link_canvas._stamp || Math.random()) : '', l._sel_snapshot ? Math.random() : '',
				l._mask ? obj_id(l._mask.canvas) + ':' + l._mask.enabled : '', l._ft ? Math.random() : '',
				JSON.stringify(l.params), JSON.stringify(l.filters), JSON.stringify(l.styles), l.type == 'text' ? JSON.stringify(l.data) : '',
				l.smart ? JSON.stringify(l.smart.filters || []) : '', l.parent_id].join(','));
		}
		return parts.join(';');
	}

	get_clip_buffer() {
		if (!this.clip_buffer || this.clip_buffer.width != config.WIDTH || this.clip_buffer.height != config.HEIGHT) {
			this.clip_buffer = document.createElement('canvas');
			this.clip_buffer.width = config.WIDTH;
			this.clip_buffer.height = config.HEIGHT;
		}
		return this.clip_buffer;
	}

	/**
	 * reusable document-sized canvas for masked layers
	 */
	get_mask_buffer() {
		if (!this.mask_buffer || this.mask_buffer.width != config.WIDTH || this.mask_buffer.height != config.HEIGHT) {
			this.mask_buffer = document.createElement('canvas');
			this.mask_buffer.width = config.WIDTH;
			this.mask_buffer.height = config.HEIGHT;
		}
		return this.mask_buffer;
	}

	/**
	 * Gets called before render_object starts it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	pre_render_object(ctx, object) {
		//apply pre-filters
		for (var i in object.filters) {
			var filter = object.filters[i];
			if (filter.id == this.disabled_filter_id) {
				continue;
			}

			filter.name = filter.name.replace("drop-shadow", "shadow");

			//find filter
			var found = false;
			for (var i in this.Base_gui.modules) {
				if (i.indexOf("effects") == -1 || i.indexOf("abstract") > -1) continue;

				var filter_class = this.Base_gui.modules[i];
				var module_name = i.split("/").pop();
				if (module_name == filter.name) {
					//found it
					found = true;
					filter_class.render_pre(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter.name);
			}
		}
	}

	/**
	 * Gets called after when render_object finishes it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	after_render_object(ctx, object) {
		//apply post-filters
		for (var i in object.filters) {
			var filter = object.filters[i];
			if (filter.id == this.disabled_filter_id) {
				continue;
			}
			filter.name = filter.name.replace("drop-shadow", "shadow");

			//find filter
			var found = false;
			for (var i in this.Base_gui.modules) {
				if (i.indexOf("effects") == -1 || i.indexOf("abstract") > -1) continue;

				var filter_class = this.Base_gui.modules[i];
				var module_name = i.split("/").pop();
				if (module_name == filter.name) {
					//found it
					found = true;
					filter_class.render_post(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter.name);
			}
		}
	}

	/**
	 * creates new layer
	 *
	 * @param {array} settings
	 * @param {boolean} can_automate
	 */
	async insert(settings, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Insert_layer_action(settings, can_automate)
		);
	}

	/**
	 * autoresize layer, based on dimensions, up - always, if 1 layer - down.
	 *
	 * @param {int} width
	 * @param {int} height
	 * @param {int} layer_id
	 * @param {boolean} can_automate
	 */
	async autoresize(width, height, layer_id, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Autoresize_canvas_action(
				width,
				height,
				layer_id,
				can_automate
			)
		);
	}

	/**
	 * returns layer
	 *
	 * @param {int} id
	 * @returns {object}
	 */
	get_layer(id) {
		if (id == undefined) {
			id = config.layer.id;
		}
		for (var i in config.layers) {
			if (config.layers[i].id == id) {
				return config.layers[i];
			}
		}
		alertify.error("Error: can not find layer with id:" + id);
		return null;
	}

	/**
	 * removes layer
	 *
	 * @param {int} id
	 * @param {boolean} force - Force to delete first layer?
	 */
	async delete(id, force) {
		return app.State.do_action(new app.Actions.Delete_layer_action(id, force));
	}

	/*
	 * removes all layers
	 */
	async reset_layers(auto_insert) {
		return app.State.do_action(
			new app.Actions.Reset_layers_action(auto_insert)
		);
	}

	/**
	 * toggle layer visibility
	 *
	 * @param {int} id
	 */
	async toggle_visibility(id) {
		return app.State.do_action(
			new app.Actions.Toggle_layer_visibility_action(id)
		);
	}

	/*
	 * renew layers HTML
	 */
	refresh_gui() {
		this.Base_gui.GUI_layers.render_layers();
	}

	/**
	 * marks layer as selected, active
	 *
	 * @param {int} id
	 */
	async select(id) {
		return app.State.do_action(new app.Actions.Select_layer_action(id));
	}

	/**
	 * change layer opacity
	 *
	 * @param {int} id
	 * @param {int} value 0-100
	 */
	async set_opacity(id, value) {
		value = parseInt(value);
		if (value < 0 || value > 100) {
			//reset
			value = 100;
		}
		return app.State.do_action(
			new app.Actions.Update_layer_action(id, {
				opacity: value,
			})
		);
	}

	/**
	 * clear layer data
	 *
	 * @param {int} id
	 */
	async layer_clear(id) {
		return app.State.do_action(new app.Actions.Clear_layer_action(id));
	}

	/**
	 * move layer up or down
	 *
	 * @param {int} id
	 * @param {int} direction
	 */
	async move(id, direction) {
		return app.State.do_action(
			new app.Actions.Reorder_layer_action(id, direction)
		);
	}

	/**
	 * clone and sort.
	 */
	get_sorted_layers() {
		return config.layers.concat().sort(
			//sort function
			(a, b) => b.order - a.order
		);
	}

	/**
	 * checks if layer empty
	 *
	 * @param {int} id
	 * @returns {Boolean}
	 */
	is_layer_empty(id) {
		var link = this.get_layer(id);

		if (
			(link.width == 0 || link.width === null) &&
			(link.height == 0 || link.height === null) &&
			link.data == null
		) {
			return true;
		}

		return false;
	}

	/**
	 * find next layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_next(id) {
		id = parseInt(id);
		var link = this.get_layer(id);
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i = layers_sorted.length - 1; i >= 0; i--) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * find previous layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_previous(id) {
		id = parseInt(id);
		var link = this.get_layer(id);
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i in layers_sorted) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * returns global position, for example if canvas is zoomed, it will convert relative mouse position to absolute
	 * at 100% zoom.
	 *
	 * @param {int} x
	 * @param {int} y
	 * @returns {object} keys: x, y
	 */
	get_world_coords(x, y) {
		return zoomView.toWorld(x, y);
	}

	/**
	 * register new live filter
	 *
	 * @param {int} layer_id
	 * @param {string} name
	 * @param {object} params
	 */
	add_filter(layer_id, name, params) {
		return app.State.do_action(
			new app.Actions.Add_layer_filter_action(layer_id, name, params)
		);
	}

	/**
	 * delete live filter
	 *
	 * @param {int} layer_id
	 * @param {string} filter_id
	 */
	delete_filter(layer_id, filter_id) {
		return app.State.do_action(
			new app.Actions.Delete_layer_filter_action(layer_id, filter_id)
		);
	}

	/**
	 * exports all layers to canvas for saving
	 *
	 * @param {canvas.context} ctx
	 * @param {int} layer_id Optional
	 * @param {boolean} is_preview Optional
	 */
	convert_layers_to_canvas(ctx, layer_id = null, is_preview = true) {
		const newCanvas = this.create_new_canvas(ctx);
		const layers_sorted = this.get_sorted_layers();
		this.render_objects(ctx, newCanvas, layers_sorted, ()=>{
			ctx.save();
		}, (value) => {
			if (value.visible == false || value.type == null) {
				return true;
			}
			if (layer_id != null && value.id != layer_id) {
				return true;
			}
		});
	}
	/**
	 * exports (active) layer to canvas for saving
	 *
	 * @param {int} layer_id or current layer by default
	 * @param {boolean} actual_area used for resized image. Default is false.
	 * @param {boolean} can_trim default is true
	 * @returns {canvas}
	 */
	convert_layer_to_canvas(layer_id, actual_area = false, can_trim) {
		if (actual_area == null) actual_area = false;
		if (layer_id == null) layer_id = config.layer.id;
		var link = this.get_layer(layer_id);
		var offset_x = 0;
		var offset_y = 0;

		//create tmp canvas
		var canvas = document.createElement("canvas");
		if (actual_area === true && link.type == "image") {
			canvas.width = link.width_original;
			canvas.height = link.height_original;
			can_trim = false;
		} else {
			canvas.width = Math.max(link.width, config.WIDTH);
			canvas.height = Math.max(link.height, config.HEIGHT);
		}

		//add data
		if (actual_area === true && link.type == "image") {
			canvas.getContext("2d").drawImage(link.link, 0, 0);
		} else {
			this.render_object(canvas.getContext("2d"), link);
		}

		//trim
		if ((can_trim == true || can_trim == undefined) && link.type != null) {
			var trim_info = this.Image_trim.get_trim_info(layer_id);
			if (
				trim_info.left > 0 ||
				trim_info.top > 0 ||
				trim_info.right > 0 ||
				trim_info.bottom > 0
			) {
				offset_x = trim_info.left;
				offset_y = trim_info.top;

				var w = canvas.width - trim_info.left - trim_info.right;
				var h = canvas.height - trim_info.top - trim_info.bottom;
				if (w > 1 && h > 1) {
					this.Helper.change_canvas_size(canvas, w, h, offset_x, offset_y);
				}
			}
		}

		canvas.dataset.x = offset_x;
		canvas.dataset.y = offset_y;

		return canvas;
	}

	/**
	 * updates layer image data
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 */
	update_layer_image(canvas, layer_id) {
		return app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas, layer_id)
		);
	}

	/**
	 * returns canvas dimensions.
	 *
	 * @returns {object}
	 */
	get_dimensions() {
		return {
			width: config.WIDTH,
			height: config.HEIGHT,
		};
	}

	/**
	 * returns all layers
	 *
	 * @returns {array}
	 */
	get_layers() {
		return config.layers;
	}

	/**
	 * disabled filter by id
	 *
	 * @param filter_id
	 */
	disable_filter(filter_id) {
		this.disabled_filter_id = filter_id;
	}

	/**
	 * finds layer filter by filter ID
	 *
	 * @param filter_id
	 * @param filter_name
	 * @param layer_id
	 * @returns {object}
	 */
	find_filter_by_id(filter_id, filter_name, layer_id) {
		if (typeof layer_id == "undefined") {
			var layer = config.layer;
		} else {
			var layer = this.get_layer(layer_id);
		}

		var filter = {};
		for (var i in layer.filters) {
			if (
				layer.filters[i].name == filter_name &&
				layer.filters[i].id == filter_id
			) {
				return layer.filters[i].params;
			}
		}

		return filter;
	}
}

export default Base_layers_class;
