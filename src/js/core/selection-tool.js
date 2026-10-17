/*
 * Common behaviour of selection tools (marquee, lasso, magic wand), Photoshop style:
 * - mode from options bar, or from keys pressed at mouse down:
 *   Shift = add, Alt = subtract, Shift+Alt = intersect
 * - "new" mode: drag inside selection moves the selection outline, click deselects
 */
import config from './../config.js';
import Base_tools_class from './base-tools.js';
import Pixel_selection_class, { MODES } from './pixel-selection.js';
import { track_drag, view_xy } from './view-nav.js';

export default class Selection_tool_base extends Base_tools_class {

	constructor() {
		super();
		this.Selection = new Pixel_selection_class();
	}

	/**
	 * subclasses: start(point, mode, event), and optionally move / end
	 */
	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.on_down(e);
		});
	}

	get_point(e) {
		var canvas = document.getElementById('canvas_minipaint');
		var rect = canvas.getBoundingClientRect();
		var world = app_layers().get_world_coords(...view_xy(e));
		return { x: world.x, y: world.y };
	}

	get_mode(e) {
		if (e.shiftKey && e.altKey) return MODES[3];
		if (e.shiftKey) return MODES[1];
		if (e.altKey) return MODES[2];
		var params = this.getParams();
		var mode = params.mode;
		//select attributes can come as { value, values }
		if (mode && typeof mode == 'object') mode = mode.value;
		return mode || MODES[0];
	}

	get_feather() {
		var params = this.getParams();
		return Math.max(0, parseFloat(params.feather) || 0);
	}

	on_down(e) {
		var point = this.get_point(e);
		var mode = this.get_mode(e);
		if (mode == MODES[0] && this.allow_move !== false && this.Selection.contains(point.x, point.y)) {
			this.move_selection(e, point);
			return;
		}
		this.start(point, mode, e);
	}

	move_selection(e, start) {
		var _this = this;
		var scale = config.ZOOM || 1;
		var total = { x: 0, y: 0 };
		track_drag(e, function (dx, dy) {
			total.x += dx / scale;
			total.y += dy / scale;
			_this.Selection.set_preview(null, { x: Math.round(total.x), y: Math.round(total.y) });
		}, function () {
			_this.Selection.set_preview(null, null);
			if (Math.abs(total.x) >= 1 || Math.abs(total.y) >= 1) {
				_this.Selection.moved(total.x, total.y);
			}
			else {
				//click inside selection in new mode = deselect (Photoshop)
				_this.Selection.deselect();
			}
		});
	}

	/**
	 * standard drag: calls draw(start, current, event) for preview path,
	 * finish(start, end, event) on release
	 */
	drag_shape(e, start, mode) {
		var _this = this;
		var scale = config.ZOOM || 1;
		var current = { x: start.x, y: start.y };
		var shift_at_start = e.shiftKey;
		var alt_at_start = e.altKey;
		var keys = { shiftKey: e.shiftKey, altKey: e.altKey };
		var update = function () {
			_this.Selection.set_preview(_this.preview(start, current, _this.modifiers(keys, shift_at_start, alt_at_start)));
		};
		//modifier keys can change while dragging
		var on_key = function (ev) {
			keys = { shiftKey: ev.shiftKey, altKey: ev.altKey };
			if (ev.key == 'Alt') ev.preventDefault();
			update();
		};
		document.addEventListener('keydown', on_key, true);
		document.addEventListener('keyup', on_key, true);
		track_drag(e, function (dx, dy, ev) {
			current.x += dx / scale;
			current.y += dy / scale;
			keys = { shiftKey: ev.shiftKey, altKey: ev.altKey };
			update();
		}, function () {
			document.removeEventListener('keydown', on_key, true);
			document.removeEventListener('keyup', on_key, true);
			_this.Selection.set_preview(null);
			var moved = Math.abs(current.x - start.x) >= 1 || Math.abs(current.y - start.y) >= 1;
			if (!moved) {
				if (mode == MODES[0]) _this.Selection.deselect();
				return;
			}
			_this.finish(start, current, mode, _this.modifiers(keys, shift_at_start, alt_at_start));
		});
	}

	/**
	 * keys pressed after the drag started: Shift = constrain, Alt = from center
	 */
	modifiers(e, shift_at_start, alt_at_start) {
		return {
			constrain: e.shiftKey && !shift_at_start,
			center: e.altKey && !alt_at_start,
		};
	}
}

function app_layers() {
	return window.Layers;
}
