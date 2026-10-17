import config from './../config.js';
import Selection_tool_base from './../core/selection-tool.js';
import { MODES } from './../core/pixel-selection.js';
import { track_drag } from './../core/view-nav.js';

/**
 * Lasso tool (L): freehand selection, closed automatically on release
 */
class Lasso_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'lasso';
	}

	start(point, mode, e) {
		var _this = this;
		var scale = config.ZOOM || 1;
		var points = [[point.x, point.y]];
		var current = { x: point.x, y: point.y };
		track_drag(e, function (dx, dy) {
			current.x += dx / scale;
			current.y += dy / scale;
			var last = points[points.length - 1];
			if (Math.abs(last[0] - current.x) + Math.abs(last[1] - current.y) >= 1 / scale) {
				points.push([current.x, current.y]);
			}
			_this.Selection.set_preview(_this.path(points, false));
		}, function () {
			_this.Selection.set_preview(null);
			if (points.length < 3) {
				if (mode == MODES[0]) _this.Selection.deselect();
				return;
			}
			_this.fill(points, mode, '올가미');
		});
	}

	path(points, close) {
		var path = new Path2D();
		path.moveTo(points[0][0], points[0][1]);
		for (var i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
		if (close) path.closePath();
		return path;
	}

	fill(points, mode, description) {
		var shape = this.Selection.shape_canvas(this.get_feather());
		shape.ctx.fill(this.path(points, true));
		this.Selection.combine(this.Selection.finish_shape(shape), mode, description);
	}
}

export default Lasso_class;
