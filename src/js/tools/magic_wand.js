import app from './../app.js';
import config from './../config.js';
import Selection_tool_base from './../core/selection-tool.js';

/**
 * Magic Wand tool (W): selects similar colors.
 * Options like Photoshop: tolerance, contiguous, sample all layers, anti-alias.
 */
class Magic_wand_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'magic_wand';
		this.allow_move = false;
	}

	start(point, mode) {
		var params = this.getParams();
		var x = Math.floor(point.x), y = Math.floor(point.y);
		var w = config.WIDTH, h = config.HEIGHT;
		if (x < 0 || y < 0 || x >= w || y >= h) return;

		var source = document.createElement('canvas');
		source.width = w;
		source.height = h;
		var sctx = source.getContext('2d', { willReadFrequently: true });
		if (params.sample_all) {
			app.Layers.convert_layers_to_canvas(sctx, null, false);
		}
		else if (config.layer && config.layer.type) {
			app.Layers.render_object(sctx, Object.assign({}, config.layer, { visible: true, _mask: null }));
		}
		var data = sctx.getImageData(0, 0, w, h).data;
		var tolerance = Math.max(0, Math.min(255, parseInt(params.tolerance) || 0));
		var start = (y * w + x) * 4;
		var r = data[start], g = data[start + 1], b = data[start + 2], a = data[start + 3];
		var similar = function (index) {
			var i = index * 4;
			return Math.abs(data[i] - r) <= tolerance && Math.abs(data[i + 1] - g) <= tolerance
				&& Math.abs(data[i + 2] - b) <= tolerance && Math.abs(data[i + 3] - a) <= tolerance;
		};

		var selected = new Uint8Array(w * h);
		if (params.contiguous) {
			//scanline flood fill
			var stack = [x, y];
			while (stack.length) {
				var cy = stack.pop();
				var cx = stack.pop();
				var lx = cx;
				while (lx >= 0 && !selected[cy * w + lx] && similar(cy * w + lx)) lx--;
				lx++;
				var up = false, down = false;
				for (var px = lx; px < w; px++) {
					var index = cy * w + px;
					if (selected[index] || !similar(index)) break;
					selected[index] = 1;
					if (cy > 0) {
						var can_up = !selected[index - w] && similar(index - w);
						if (can_up && !up) {
							stack.push(px, cy - 1);
							up = true;
						}
						else if (!can_up) up = false;
					}
					if (cy < h - 1) {
						var can_down = !selected[index + w] && similar(index + w);
						if (can_down && !down) {
							stack.push(px, cy + 1);
							down = true;
						}
						else if (!can_down) down = false;
					}
				}
			}
		}
		else {
			for (var i = 0; i < selected.length; i++) {
				if (similar(i)) selected[i] = 1;
			}
		}

		var shape = this.Selection.shape_canvas(this.get_feather());
		var image = shape.ctx.createImageData(w, h);
		for (var j = 0; j < selected.length; j++) {
			if (selected[j]) {
				var o = j * 4;
				image.data[o] = image.data[o + 1] = image.data[o + 2] = 255;
				image.data[o + 3] = 255;
			}
		}
		shape.ctx.putImageData(image, 0, 0);
		var canvas = this.Selection.finish_shape(shape);
		if (params.anti_alias !== false && !shape.feather) {
			//soften the stair-step edge a little
			canvas = this.Selection.blurred(canvas, 1);
		}
		this.Selection.combine(canvas, mode, '자동 선택');
	}
}

export default Magic_wand_class;
