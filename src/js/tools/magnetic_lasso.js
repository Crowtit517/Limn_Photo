import config from './../config.js';
import Lasso_class from './lasso.js';
import { MODES } from './../core/pixel-selection.js';
import { render_all_doc } from './../core/ai-apply.js';
import { track_drag } from './../core/view-nav.js';

/**
 * Magnetic Lasso tool (L): the outline snaps to the strongest edge near the cursor
 */
class Magnetic_lasso_class extends Lasso_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'magnetic_lasso';
	}

	start(point, mode, e) {
		var _this = this;
		var W = config.WIDTH, H = config.HEIGHT;
		var doc = render_all_doc().getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
		var lum = function (x, y) {
			x = Math.max(0, Math.min(W - 1, x));
			y = Math.max(0, Math.min(H - 1, y));
			var o = (y * W + x) * 4;
			return doc[o] * 0.299 + doc[o + 1] * 0.587 + doc[o + 2] * 0.114;
		};
		var edge = function (x, y) {
			var gx = lum(x + 1, y) - lum(x - 1, y), gy = lum(x, y + 1) - lum(x, y - 1);
			return gx * gx + gy * gy;
		};
		var width = Math.max(2, this.getParams().width || 10);
		var snap = function (p) {
			var best = { x: p.x, y: p.y, e: -1 };
			var cx = Math.round(p.x), cy = Math.round(p.y);
			for (var y = cy - width; y <= cy + width; y++) {
				for (var x = cx - width; x <= cx + width; x++) {
					if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > width * width) continue;
					//strong edge wins, closeness breaks ties
					var v = edge(x, y) - ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * 4;
					if (v > best.e) best = { x: x, y: y, e: v };
				}
			}
			return best.e > 200 ? best : p;
		};
		var scale = config.ZOOM || 1;
		var first = snap(point);
		var points = [[first.x, first.y]];
		var current = { x: point.x, y: point.y };
		track_drag(e, function (dx, dy) {
			current.x += dx / scale;
			current.y += dy / scale;
			var p = snap(current);
			var last = points[points.length - 1];
			if (Math.abs(last[0] - p.x) + Math.abs(last[1] - p.y) >= 2) points.push([p.x, p.y]);
			_this.Selection.set_preview(_this.path(points, false));
		}, function () {
			_this.Selection.set_preview(null);
			if (points.length < 3) {
				if (mode == MODES[0]) _this.Selection.deselect();
				return;
			}
			_this.fill(points, mode, '자석 올가미');
		});
	}
}

export default Magnetic_lasso_class;
