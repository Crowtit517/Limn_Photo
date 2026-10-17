import Selection_tool_base from './../core/selection-tool.js';

/**
 * shared by rectangular and elliptical marquee
 */
export function marquee_box(start, current, mods) {
	var w = current.x - start.x;
	var h = current.y - start.y;
	if (mods.constrain) {
		var size = Math.max(Math.abs(w), Math.abs(h));
		w = (w < 0 ? -1 : 1) * size;
		h = (h < 0 ? -1 : 1) * size;
	}
	var x = start.x, y = start.y;
	if (mods.center) {
		x -= w;
		y -= h;
		w *= 2;
		h *= 2;
	}
	var left = Math.round(Math.min(x, x + w)), top = Math.round(Math.min(y, y + h));
	return {
		x: left,
		y: top,
		width: Math.round(Math.max(x, x + w)) - left,
		height: Math.round(Math.max(y, y + h)) - top,
	};
}

/**
 * Rectangular Marquee tool (M)
 */
class Marquee_rect_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'marquee_rect';
	}

	start(point, mode, e) {
		this.drag_shape(e, point, mode);
	}

	preview(start, current, mods) {
		var box = marquee_box(start, current, mods);
		var path = new Path2D();
		path.rect(box.x, box.y, box.width, box.height);
		return path;
	}

	finish(start, current, mode, mods) {
		var box = marquee_box(start, current, mods);
		if (box.width < 1 || box.height < 1) return;
		var shape = this.Selection.shape_canvas(this.get_feather());
		shape.ctx.fillRect(box.x, box.y, box.width, box.height);
		this.Selection.combine(this.Selection.finish_shape(shape), mode, '사각형 선택 윤곽');
	}
}

export default Marquee_rect_class;
