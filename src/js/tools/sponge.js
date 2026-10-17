import Pixel_brush_base, { luminance } from './../core/pixel-brush.js';

/**
 * Sponge tool (Shift+O): saturate or desaturate
 */
class Sponge_class extends Pixel_brush_base {

	constructor(ctx) {
		super();
		this.name = 'sponge';
		this.history_name = '스펀지 도구';
	}

	apply(data, weights) {
		var flow = Math.max(1, Math.min(100, this.params.flow)) / 100;
		var saturate = (this.params.mode && this.params.mode.value || this.params.mode) == '채도 증가';
		var strength = flow * 0.1;
		for (var i = 0; i < weights.length; i++) {
			var wgt = weights[i];
			if (wgt == 0) continue;
			var o = i * 4;
			if (data[o + 3] == 0) continue;
			var r = data[o], g = data[o + 1], b = data[o + 2];
			var gray = luminance(r, g, b) * 255;
			var k = strength * wgt;
			var f = saturate ? 1 + k : 1 - k;
			data[o] = gray + (r - gray) * f;
			data[o + 1] = gray + (g - gray) * f;
			data[o + 2] = gray + (b - gray) * f;
		}
	}
}

export default Sponge_class;
