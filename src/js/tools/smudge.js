import Pixel_brush_base from './../core/pixel-brush.js';

/**
 * Smudge tool: picks up color under the brush and drags it along the stroke
 */
class Smudge_class extends Pixel_brush_base {

	constructor(ctx) {
		super();
		this.name = 'smudge';
		this.history_name = '손가락 도구';
		this.paint = null;
	}

	spacing_ratio() {
		return 0.1;
	}

	begin_stroke() {
		this.paint = null;
	}

	apply(data, weights, w, h, info) {
		var strength = Math.max(1, Math.min(100, this.params.strength)) / 100;
		var size = Math.ceil(info.radius * 2);
		//paint buffer is kept in brush space (size x size), aligned to dab center
		var ox = info.left - Math.round(info.cx - info.radius);
		var oy = info.top - Math.round(info.cy - info.radius);
		if (!this.paint || this.paint_size != size) {
			this.paint = new Float32Array(size * size * 4);
			this.paint_size = size;
			this.paint_ready = false;
		}
		var paint = this.paint;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var px = x + ox, py = y + oy;
				if (px < 0 || py < 0 || px >= size || py >= size) continue;
				var i = y * w + x;
				var o = i * 4;
				var p = (py * size + px) * 4;
				if (!this.paint_ready) {
					paint[p] = data[o];
					paint[p + 1] = data[o + 1];
					paint[p + 2] = data[o + 2];
					paint[p + 3] = data[o + 3];
					continue;
				}
				var k = weights[i] * strength;
				if (k > 0) {
					//put carried paint down
					var nr = data[o] + (paint[p] - data[o]) * k;
					var ng = data[o + 1] + (paint[p + 1] - data[o + 1]) * k;
					var nb = data[o + 2] + (paint[p + 2] - data[o + 2]) * k;
					var na = data[o + 3] + (paint[p + 3] - data[o + 3]) * k;
					data[o] = nr;
					data[o + 1] = ng;
					data[o + 2] = nb;
					data[o + 3] = na;
				}
				//pick up what is under the brush now
				paint[p] = data[o];
				paint[p + 1] = data[o + 1];
				paint[p + 2] = data[o + 2];
				paint[p + 3] = data[o + 3];
			}
		}
		this.paint_ready = true;
	}
}

export default Smudge_class;
