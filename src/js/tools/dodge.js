import Pixel_brush_base, { luminance } from './../core/pixel-brush.js';

export const RANGES = ['어두운 영역', '중간 영역', '밝은 영역'];

/**
 * how much a pixel of brightness l (0..1) is affected for the tone range
 */
export function range_weight(range, l) {
	if (range == RANGES[0]) return Math.pow(1 - l, 1.6);
	if (range == RANGES[2]) return Math.pow(l, 1.6);
	return 1 - Math.pow(Math.abs(2 * l - 1), 2);
}

/**
 * Dodge tool (O): lightens, Burn tool shares the code with direction -1
 */
class Dodge_class extends Pixel_brush_base {

	constructor(ctx) {
		super();
		this.name = 'dodge';
		this.history_name = '닷지 도구';
		this.direction = 1;
	}

	apply(data, weights, w, h) {
		var exposure = Math.max(1, Math.min(100, this.params.exposure)) / 100;
		var range = (this.params.range && this.params.range.value) || this.params.range || RANGES[1];
		//each dab adds a little, strokes build up like Photoshop
		var strength = exposure * 0.12;
		for (var i = 0; i < weights.length; i++) {
			var wgt = weights[i];
			if (wgt == 0) continue;
			var o = i * 4;
			if (data[o + 3] == 0) continue;
			var r = data[o], g = data[o + 1], b = data[o + 2];
			var k = strength * wgt * range_weight(range, luminance(r, g, b));
			if (this.direction > 0) {
				data[o] = r + (255 - r) * k;
				data[o + 1] = g + (255 - g) * k;
				data[o + 2] = b + (255 - b) * k;
			}
			else {
				data[o] = r - r * k;
				data[o + 1] = g - g * k;
				data[o + 2] = b - b * k;
			}
		}
	}
}

export default Dodge_class;
