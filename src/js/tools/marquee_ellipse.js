import Selection_tool_base from './../core/selection-tool.js';
import { marquee_box } from './marquee_rect.js';

/**
 * Elliptical Marquee tool (Shift+M)
 */
class Marquee_ellipse_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'marquee_ellipse';
	}

	start(point, mode, e) {
		this.drag_shape(e, point, mode);
	}

	ellipse(path, box) {
		path.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
	}

	preview(start, current, mods) {
		var path = new Path2D();
		this.ellipse(path, marquee_box(start, current, mods));
		return path;
	}

	finish(start, current, mode, mods) {
		var box = marquee_box(start, current, mods);
		if (box.width < 1 || box.height < 1) return;
		var shape = this.Selection.shape_canvas(this.get_feather());
		var path = new Path2D();
		this.ellipse(path, box);
		shape.ctx.fill(path);
		this.Selection.combine(this.Selection.finish_shape(shape), mode, '타원 선택 윤곽');
	}
}

export default Marquee_ellipse_class;
