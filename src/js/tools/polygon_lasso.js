import config from './../config.js';
import Selection_tool_base from './../core/selection-tool.js';

/**
 * Polygonal Lasso tool (Shift+L): click points; double click, Enter or click on the
 * start point closes; Backspace removes last point; Escape cancels
 */
class Polygon_lasso_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'polygon_lasso';
		this.allow_move = false;
		this.points = null;
	}

	load() {
		super.load();
		var _this = this;
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || !_this.points) return;
			_this.hover = _this.get_point(e);
			_this.update_preview();
		});
		document.addEventListener('dblclick', function () {
			if (config.TOOL.name != _this.name || !_this.points) return;
			_this.close();
		});
		document.addEventListener('keydown', function (e) {
			if (config.TOOL.name != _this.name || !_this.points) return;
			if (e.key == 'Enter') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.close();
			}
			else if (e.key == 'Escape') {
				_this.cancel();
			}
			else if (e.key == 'Backspace' || e.key == 'Delete') {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.points.pop();
				if (_this.points.length == 0) _this.cancel();
				else _this.update_preview();
			}
		}, true);
	}

	on_down(e) {
		var point = this.get_point(e);
		if (!this.points) {
			this.mode = this.get_mode(e);
			this.points = [[point.x, point.y]];
			this.update_preview();
			return;
		}
		var first = this.points[0];
		var near = 6 / (config.ZOOM || 1);
		if (this.points.length > 2 && Math.abs(point.x - first[0]) < near && Math.abs(point.y - first[1]) < near) {
			this.close();
			return;
		}
		var last = this.points[this.points.length - 1];
		if (Math.abs(point.x - last[0]) < 0.5 && Math.abs(point.y - last[1]) < 0.5) return;
		this.points.push([point.x, point.y]);
		this.update_preview();
	}

	update_preview() {
		if (!this.points) return;
		var path = new Path2D();
		path.moveTo(this.points[0][0], this.points[0][1]);
		for (var i = 1; i < this.points.length; i++) path.lineTo(this.points[i][0], this.points[i][1]);
		if (this.hover) path.lineTo(this.hover.x, this.hover.y);
		this.Selection.set_preview(path);
	}

	close() {
		var points = this.points;
		var mode = this.mode;
		this.cancel();
		if (!points || points.length < 3) return;
		var shape = this.Selection.shape_canvas(this.get_feather());
		var path = new Path2D();
		path.moveTo(points[0][0], points[0][1]);
		for (var i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
		path.closePath();
		shape.ctx.fill(path);
		this.Selection.combine(this.Selection.finish_shape(shape), mode, '다각형 올가미');
	}

	cancel() {
		this.points = null;
		this.hover = null;
		this.Selection.set_preview(null);
	}

	on_leave() {
		this.cancel();
		return [];
	}
}

export default Polygon_lasso_class;
