import config from './../config.js';
import Selection_tool_base from './../core/selection-tool.js';
import { MODES, new_canvas } from './../core/pixel-selection.js';
import { track_drag } from './../core/view-nav.js';
import { segment } from './../core/ai.js';
import { render_layer_doc, render_all_doc, pixels_key } from './../core/ai-apply.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Object Selection tool (W), AI based like Photoshop:
 * click on an object, or drag a box around it.
 * Shift / Alt at mouse down add / subtract, same as other selection tools.
 */
class Object_select_class extends Selection_tool_base {

	constructor(ctx) {
		super();
		this.name = 'object_select';
		this.allow_move = false;
		this.busy = false;
	}

	start(point, mode, e) {
		var _this = this;
		if (this.busy) return;
		var scale = config.ZOOM || 1;
		var current = { x: point.x, y: point.y };
		track_drag(e, function (dx, dy) {
			current.x += dx / scale;
			current.y += dy / scale;
			var path = new Path2D();
			path.rect(Math.min(point.x, current.x), Math.min(point.y, current.y),
				Math.abs(current.x - point.x), Math.abs(current.y - point.y));
			_this.Selection.set_preview(path);
		}, function () {
			_this.Selection.set_preview(null);
			var box = null;
			if (Math.abs(current.x - point.x) > 4 / scale && Math.abs(current.y - point.y) > 4 / scale) {
				box = {
					x: Math.min(point.x, current.x), y: Math.min(point.y, current.y),
					width: Math.abs(current.x - point.x), height: Math.abs(current.y - point.y),
				};
			}
			_this.run(point, box, mode);
		});
	}

	async run(point, box, mode) {
		var params = this.getParams();
		var sample_all = !!params.sample_all;
		var source = sample_all ? render_all_doc() : render_layer_doc(config.layer);
		var points;
		if (box) {
			//object inside the box: center as object point, corners as background
			points = [
				[box.x + box.width / 2, box.y + box.height / 2, 1],
				[box.x, box.y, 0],
				[box.x + box.width, box.y + box.height, 0],
			];
		}
		else {
			points = [[point.x, point.y, 1]];
		}
		this.busy = true;
		document.getElementById('main_wrapper').style.cursor = 'progress';
		var mask;
		try {
			mask = await segment(source, pixels_key(sample_all), points);
		}
		catch (e) {
			console.error(e);
			alertify.error('AI 오브젝트 선택에 실패했습니다: ' + (e && e.message ? e.message : e));
			return;
		}
		finally {
			this.busy = false;
			document.getElementById('main_wrapper').style.cursor = 'default';
		}
		if (!mask) {
			alertify.message('개체를 찾지 못했습니다.');
			return;
		}
		var shape = new_canvas();
		var ctx = shape.getContext('2d');
		ctx.drawImage(mask, 0, 0, shape.width, shape.height);
		if (box) {
			//keep result inside the drawn box (a little margin)
			var margin = Math.max(4, Math.min(box.width, box.height) * 0.05);
			ctx.globalCompositeOperation = 'destination-in';
			ctx.fillStyle = '#fff';
			ctx.fillRect(box.x - margin, box.y - margin, box.width + margin * 2, box.height + margin * 2);
			ctx.globalCompositeOperation = 'source-over';
		}
		var result = shape;
		if (params.feather > 0) {
			result = this.Selection.blurred(shape, params.feather);
		}
		else {
			//smooth stair steps of the mask
			result = this.Selection.blurred(shape, 1);
		}
		this.Selection.combine(result, mode || MODES[0], '오브젝트 선택');
	}
}

export default Object_select_class;
