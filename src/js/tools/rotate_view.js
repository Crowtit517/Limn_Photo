import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { rotate_drag, set_view_rotation, set_cursor } from './../core/view-nav.js';

/**
 * Rotate View tool (R): drag turns the canvas on screen like a sheet of paper on a desk.
 * Only the view changes (not the image, not the history). Shift = 15 degree steps,
 * Esc or "보기 초기화" = back to 0.
 */
class Rotate_view_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'rotate_view';
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			rotate_drag(e, function () {
				set_cursor('grab');
			});
		});
		document.addEventListener('keydown', function (e) {
			if (config.TOOL.name != _this.name || e.key != 'Escape') return;
			if (e.target.closest && e.target.closest('input, textarea, .adj_dialog')) return;
			set_view_rotation(0);
		});
		window.addEventListener('photolab-view-rotation', function () {
			var input = document.getElementById('rv_angle');
			if (input && document.activeElement != input) input.value = config.VIEW_ROTATION || 0;
		});
	}

	on_activate() {
		set_cursor('grab');
		this.render_options();
	}

	/**
	 * options bar: 회전 각도 [ ]°  [보기 초기화]
	 */
	render_options() {
		var box = document.getElementById('action_attributes');
		if (!box) return;
		box.innerHTML = '';
		var item = document.createElement('div');
		item.className = 'item ui_flex_group no_wrap rv_options';
		item.innerHTML = '<label for="rv_angle">회전 각도:</label>'
			+ '<input id="rv_angle" type="number" step="1" min="-180" max="180" style="width:64px" value="' + (config.VIEW_ROTATION || 0) + '" />'
			+ '<span>°</span>'
			+ '<button type="button" class="ui_btn" id="rv_reset">보기 초기화</button>';
		box.appendChild(item);
		var input = item.querySelector('#rv_angle');
		input.addEventListener('change', function () {
			set_view_rotation(parseFloat(input.value) || 0);
			input.value = config.VIEW_ROTATION;
		});
		input.addEventListener('keydown', function (e) {
			if (e.key == 'Enter') input.blur();
		});
		item.querySelector('#rv_reset').addEventListener('click', function () {
			set_view_rotation(0);
		});
	}
}

export default Rotate_view_class;
