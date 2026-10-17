/*
 * Healing (Healing Brush, Patch tool): copy texture from a source area and match it
 * to the colour and brightness around the destination, so the repair blends in.
 *
 * result = source + (surroundings of destination - surroundings of source)
 * Surroundings are averages over pixels outside the mask (normalized blur).
 */
import app from './../app.js';
import config from './../config.js';
import { new_canvas } from './pixel-selection.js';

function alpha_bounds(canvas) {
	var w = canvas.width, h = canvas.height;
	var data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
	var min_x = w, min_y = h, max_x = -1, max_y = -1;
	for (var y = 0; y < h; y++) {
		var row = y * w * 4;
		for (var x = 0; x < w; x++) {
			if (data[row + x * 4 + 3] > 8) {
				if (x < min_x) min_x = x;
				if (x > max_x) max_x = x;
				if (y < min_y) min_y = y;
				if (y > max_y) max_y = y;
			}
		}
	}
	return max_x < 0 ? null : { x: min_x, y: min_y, w: max_x - min_x + 1, h: max_y - min_y + 1 };
}

/**
 * layer pixels of a document rectangle
 */
function layer_region(layer, x, y, w, h) {
	var canvas = new_canvas(w, h);
	canvas.getContext('2d').drawImage(layer.link, layer.x - x, layer.y - y, layer.width, layer.height);
	return canvas;
}

/**
 * average colour of pixels around the hole (mask area excluded)
 */
function surroundings(region, mask_region, radius) {
	var w = region.width, h = region.height;
	var holed = new_canvas(w, h);
	var hctx = holed.getContext('2d');
	hctx.drawImage(region, 0, 0);
	hctx.globalCompositeOperation = 'destination-out';
	hctx.drawImage(mask_region, 0, 0);
	var out = new_canvas(w, h);
	var octx = out.getContext('2d', { willReadFrequently: true });
	octx.filter = 'blur(' + radius + 'px)';
	octx.drawImage(holed, 0, 0);
	octx.filter = 'none';
	return octx.getImageData(0, 0, w, h).data;
}

/**
 * heals mask area (document canvas, alpha = amount) of layer with pixels at offset (dx, dy)
 * returns false if nothing to do
 */
export async function heal_from_source(layer, mask, dx, dy, description) {
	if (!layer || layer.type != 'image' || !layer.link) return false;
	var bounds = alpha_bounds(mask);
	if (!bounds) return false;
	var radius = Math.max(4, Math.min(80, Math.max(bounds.w, bounds.h) * 0.35));
	var pad = Math.ceil(radius * 2) + 2;
	var x = Math.max(0, bounds.x - pad), y = Math.max(0, bounds.y - pad);
	var w = Math.min(config.WIDTH, bounds.x + bounds.w + pad) - x;
	var h = Math.min(config.HEIGHT, bounds.y + bounds.h + pad) - y;
	dx = Math.round(dx);
	dy = Math.round(dy);

	var target = layer_region(layer, x, y, w, h);
	var source = layer_region(layer, x + dx, y + dy, w, h);
	var mask_region = new_canvas(w, h);
	mask_region.getContext('2d').drawImage(mask, -x, -y);

	var t_surr = surroundings(target, mask_region, radius);
	var s_surr = surroundings(source, mask_region, radius);
	var sctx = source.getContext('2d', { willReadFrequently: true });
	var src = sctx.getImageData(0, 0, w, h);
	var s = src.data;
	for (var i = 0; i < s.length; i += 4) {
		if (t_surr[i + 3] == 0 || s_surr[i + 3] == 0) continue;
		s[i] += t_surr[i] - s_surr[i];
		s[i + 1] += t_surr[i + 1] - s_surr[i + 1];
		s[i + 2] += t_surr[i + 2] - s_surr[i + 2];
	}
	sctx.putImageData(src, 0, 0);

	//soft edge
	var soft = new_canvas(w, h);
	var softctx = soft.getContext('2d');
	softctx.filter = 'blur(1px)';
	softctx.drawImage(mask_region, 0, 0);
	softctx.filter = 'none';
	sctx.globalCompositeOperation = 'destination-in';
	sctx.drawImage(soft, 0, 0);

	//write back into layer pixels
	var result = new_canvas(layer.width_original || layer.link.width, layer.height_original || layer.link.height);
	var rctx = result.getContext('2d');
	rctx.drawImage(layer.link, 0, 0);
	var scale_x = result.width / layer.width, scale_y = result.height / layer.height;
	rctx.save();
	rctx.scale(scale_x, scale_y);
	rctx.drawImage(source, x - layer.x, y - layer.y);
	rctx.restore();

	await app.State.do_action(new app.Actions.Bundle_action('healing', description, [
		new app.Actions.Update_layer_image_action(result, layer.id),
	]));
	return true;
}
