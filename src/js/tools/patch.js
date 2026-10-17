import config from './../config.js';
import Lasso_class from './lasso.js';
import { MODES } from './../core/pixel-selection.js';
import { track_drag } from './../core/view-nav.js';
import { heal_from_source } from './../core/heal-transfer.js';

/**
 * Patch tool (J), Photoshop "Source" mode: draw around the problem area (works like the lasso),
 * then drag the selection onto a clean area; the problem area is healed with those pixels.
 */
class Patch_class extends Lasso_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'patch';
		this.busy = false;
	}

	on_down(e) {
		if (this.busy) return;
		var point = this.get_point(e);
		var mode = this.get_mode(e);
		if (mode == MODES[0] && this.Selection.contains(point.x, point.y)) {
			this.drag_patch(e);
			return;
		}
		this.start(point, mode, e);
	}

	drag_patch(e) {
		var _this = this;
		var scale = config.ZOOM || 1;
		var total = { x: 0, y: 0 };
		track_drag(e, function (dx, dy) {
			total.x += dx / scale;
			total.y += dy / scale;
			_this.Selection.set_preview(null, { x: Math.round(total.x), y: Math.round(total.y) });
		}, async function () {
			_this.Selection.set_preview(null, null);
			if (Math.abs(total.x) < 1 && Math.abs(total.y) < 1) return;
			_this.busy = true;
			try {
				await heal_from_source(config.layer, _this.Selection.mask, total.x, total.y, '패치 도구');
			}
			finally {
				_this.busy = false;
			}
		});
	}
}

export default Patch_class;
