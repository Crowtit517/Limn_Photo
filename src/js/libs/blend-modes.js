/*
 * Photoshop blend modes that canvas does not have (formulas from Adobe's PDF blend mode spec
 * and the common Photoshop definitions). Applied by reading back the backdrop.
 */

// composition value -> per channel function (backdrop, source) in 0..1, or 'color' for whole-pixel modes
export const CUSTOM_BLENDS = {
	'ps-dissolve': 'dissolve',
	'ps-linear-burn': function (b, s) { return b + s - 1; },
	'ps-darker-color': 'darker',
	'ps-lighter-color': 'lighter',
	'ps-vivid-light': function (b, s) {
		if (s <= 0.5) {
			var s2 = 2 * s;
			return s2 <= 0 ? (b >= 1 ? 1 : 0) : 1 - Math.min(1, (1 - b) / s2);
		}
		var d = 2 * (s - 0.5);
		return d >= 1 ? (b <= 0 ? 0 : 1) : Math.min(1, b / (1 - d));
	},
	'ps-linear-light': function (b, s) { return b + 2 * s - 1; },
	'ps-pin-light': function (b, s) { return s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1); },
	'ps-hard-mix': function (b, s) { return b + s >= 1 ? 1 : 0; },
	'ps-subtract': function (b, s) { return b - s; },
	'ps-divide': function (b, s) { return s <= 0 ? (b > 0 ? 1 : 0) : Math.min(1, b / s); },
};

export function is_custom_blend(mode) {
	return Object.prototype.hasOwnProperty.call(CUSTOM_BLENDS, mode);
}

/**
 * dst = backdrop pixels (RGBA), src = layer pixels already scaled by opacity in alpha
 */
export function apply_custom_blend(mode, dst, src) {
	var fn = CUSTOM_BLENDS[mode];
	var seed = 1;
	for (var i = 0; i < dst.length; i += 4) {
		var sa = src[i + 3] / 255;
		if (sa <= 0) continue;
		var da = dst[i + 3] / 255;
		if (fn == 'dissolve') {
			seed = (seed * 16807) % 2147483647;
			if (seed / 2147483647 < sa) {
				dst[i] = src[i];
				dst[i + 1] = src[i + 1];
				dst[i + 2] = src[i + 2];
				dst[i + 3] = 255;
			}
			continue;
		}
		var br = dst[i] / 255, bg = dst[i + 1] / 255, bb = dst[i + 2] / 255;
		var sr = src[i] / 255, sg = src[i + 1] / 255, sb = src[i + 2] / 255;
		var r, g, b;
		if (fn == 'darker' || fn == 'lighter') {
			var bl = br * 0.3 + bg * 0.59 + bb * 0.11, sl = sr * 0.3 + sg * 0.59 + sb * 0.11;
			var take_src = fn == 'darker' ? sl < bl : sl > bl;
			r = take_src ? sr : br; g = take_src ? sg : bg; b = take_src ? sb : bb;
		}
		else {
			r = fn(br, sr); g = fn(bg, sg); b = fn(bb, sb);
		}
		r = r < 0 ? 0 : r > 1 ? 1 : r;
		g = g < 0 ? 0 : g > 1 ? 1 : g;
		b = b < 0 ? 0 : b > 1 ? 1 : b;
		//W3C compositing: blended color only where backdrop exists
		var mr = (1 - da) * sr + da * r, mg = (1 - da) * sg + da * g, mb = (1 - da) * sb + da * b;
		var out_a = sa + da * (1 - sa);
		dst[i] = ((mr * sa + br * da * (1 - sa)) / out_a) * 255;
		dst[i + 1] = ((mg * sa + bg * da * (1 - sa)) / out_a) * 255;
		dst[i + 2] = ((mb * sa + bb * da * (1 - sa)) / out_a) * 255;
		dst[i + 3] = out_a * 255;
	}
}
