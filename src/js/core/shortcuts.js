import app from './../app.js';
import config from './../config.js';
import Helper_class from './../libs/helpers.js';
import { pan_by, zoom_at, track_drag, set_cursor } from './view-nav.js';
import { is_guarded, run_guarded } from './effect-guard.js';
import Actions_recorder_class from './actions-recorder.js';

/**
 * Photoshop style keyboard shortcuts.
 * Runs in capture phase and stops the event, so the original single-letter
 * shortcuts (O, R, T, D...) do not fire on top of these.
 */
const ALT_PICK_TOOLS = [
	'brush', 'pencil', 'fill', 'gradient', 'text',
	'line', 'arrow', 'rectangle', 'ellipse', 'triangle', 'right_triangle', 'romb', 'parallelogram',
	'trapezoid', 'plus', 'pentagon', 'hexagon', 'star', 'heart', 'cylinder', 'human', 'tear', 'cog', 'moon', 'callout',
];

// key: 'ctrl+shift+alt+<key>' -> [module path, function]
const COMMANDS = {
	'ctrl+n': ['file/new', 'new'],
	'ctrl+o': ['file/open', 'open_file'],
	'ctrl+s': ['file/psd', 'save'],
	'ctrl+shift+s': ['file/save', 'save'],
	'ctrl+alt+shift+s': ['file/save', 'export'],
	'ctrl+z': ['edit/undo', 'undo'],
	'ctrl+shift+z': ['edit/redo', 'redo'],
	'ctrl+y': ['edit/redo', 'redo'],
	'ctrl+a': ['select/select', 'all'],
	'ctrl+t': ['edit/transform', 'free_transform'],
	'ctrl+alt+shift+c': ['edit/content_aware_scale', 'content_aware_scale'],
	'ctrl+shift+a': ['image/camera_raw', 'camera_raw'],
	'ctrl+alt+r': ['select/subject', 'select_and_mask'],
	'ctrl+shift+x': ['image/liquify', 'liquify'],
	'ctrl+shift+d': ['select/select', 'reselect'],
	'ctrl+shift+i': ['select/select', 'inverse'],
	'shift+F6': ['select/select', 'feather'],
	'shift+F5': ['select/select', 'fill_foreground'],
	'ctrl+shift+j': ['select/select', 'layer_via_cut'],
	'ctrl+alt+i': ['image/resize', 'resize'],
	'ctrl+alt+c': ['image/size', 'size'],
	'ctrl+shift+n': ['layer/new', 'new'],
	'ctrl+e': ['layer/merge', 'merge'],
	//Photoshop: bring forward / send backward
	'ctrl+]': ['layer/move', 'up'],
	'ctrl+[': ['layer/move', 'down'],
	'ctrl+shift+e': ['layer/flatten', 'flatten'],
	'ctrl+l': ['image/adjust', 'levels'],
	'ctrl+m': ['image/adjust', 'curves'],
	'ctrl+u': ['image/adjust', 'hue_saturation'],
	'ctrl+b': ['image/adjust', 'color_balance'],
	'ctrl+g': ['layer/group', 'group'],
	'ctrl+alt+shift+e': ['layer/extras', 'stamp_visible'],
	'ctrl+shift+g': ['layer/group', 'ungroup'],
	'ctrl+i': ['image/adjust', 'invert'],
	'ctrl+shift+u': ['image/adjust', 'desaturate'],
	'ctrl+shift+l': ['image/auto_adjust', 'auto_adjust'],
	'ctrl+0': ['view/zoom', 'auto'],
	'ctrl+1': ['view/zoom', 'original'],
	'ctrl+=': ['view/zoom', 'in'],
	'ctrl++': ['view/zoom', 'in'],
	'ctrl+-': ['view/zoom', 'out'],
	"ctrl+'": ['view/grid', 'grid'],
};

class Shortcuts_class {

	constructor() {
		this.Helper = new Helper_class();
		var _this = this;
		document.addEventListener('keydown', function (event) {
			_this.on_key(event);
		}, true);
		this.alt_events();
		this.navigation_events();
	}

	/**
	 * Space = temporary hand (Ctrl+Space click zoom in, Alt+Space click zoom out),
	 * mouse wheel scrolls, Alt + wheel zooms (Photoshop defaults)
	 */
	navigation_events() {
		var _this = this;
		this.space = false;
		document.addEventListener('keydown', function (e) {
			if (e.code != 'Space' || _this.Helper.is_input(e.target) || e.target.isContentEditable) return;
			if (document.activeElement && document.activeElement.tagName == 'TEXTAREA') return;
			e.preventDefault();
			if (!_this.space) {
				_this.space = true;
				set_cursor(e.ctrlKey ? 'zoom-in' : e.altKey ? 'zoom-out' : 'grab');
			}
		}, true);
		document.addEventListener('keyup', function (e) {
			if (e.code != 'Space' || !_this.space) return;
			_this.space = false;
			set_cursor(config.TOOL && config.TOOL.name == 'text' ? 'text' : 'default');
		}, true);
		window.addEventListener('blur', function () {
			_this.space = false;
		});

		//R pressed: Rotate View; holding R while dragging is temporary and returns to the previous tool
		this.r_hold = null;
		document.addEventListener('mousedown', function (e) {
			if (_this.r_hold && e.button == 0) _this.r_hold.used = true;
		}, true);
		document.addEventListener('keyup', function (e) {
			if (e.code != 'KeyR' || !_this.r_hold) return;
			var hold = _this.r_hold;
			_this.r_hold = null;
			if (hold.used && hold.previous && hold.previous != 'rotate_view') {
				app.GUI.GUI_tools.Toolbar.choose(hold.previous);
			}
		}, true);
		document.addEventListener('mousedown', function (e) {
			if (!_this.space || e.button != 0 || !e.target.closest || !e.target.closest('#main_wrapper')) return;
			_this.stop(e);
			if (e.ctrlKey || e.metaKey) {
				zoom_at(e, 1);
				return;
			}
			if (e.altKey) {
				zoom_at(e, -1);
				return;
			}
			set_cursor('grabbing');
			track_drag(e, pan_by, function () {
				set_cursor(_this.space ? 'grab' : 'default');
			});
		}, true);

		var wrapper = document.getElementById('main_wrapper');
		wrapper.addEventListener('wheel', function (e) {
			//Preferences > Tools > Zoom with Scroll Wheel (on by default): wheel zooms at the cursor,
			//Shift + wheel scrolls sideways. Off: wheel scrolls, Alt + wheel zooms (Photoshop default)
			if (config.WHEEL_ZOOM == null) {
				var saved = new Helper_class().getCookie('wheel_zoom');
				config.WHEEL_ZOOM = saved == null ? true : !!parseInt(saved);
			}
			if (e.altKey || (config.WHEEL_ZOOM && !e.shiftKey)) {
				//let original handler zoom at cursor
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.ctrlKey || e.shiftKey) {
				pan_by(-(e.deltaY || e.deltaX), 0);
			}
			else {
				pan_by(-e.deltaX, -e.deltaY);
			}
		}, { capture: true, passive: false });
	}

	/**
	 * Alt + click: eyedropper for painting tools, set source for clone stamp
	 */
	alt_events() {
		var _this = this;
		var picking = false;
		var pick_tool = function () {
			return app.GUI.GUI_tools.tools_modules['pick_color'].object;
		};
		document.addEventListener('mousedown', function (e) {
			if (!e.altKey || e.button !== 0 || !config.TOOL || !e.target.closest || !e.target.closest('#main_wrapper')) return;
			var tool = config.TOOL.name;
			if (tool == 'clone') {
				_this.stop(e);
				//clone stamp takes its source from the context menu (right click) event
				app.Tools.set_mouse_info(e);
				e.target.dispatchEvent(new MouseEvent('contextmenu', {
					bubbles: true, cancelable: true, button: 2, buttons: 2,
					clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
				}));
				return;
			}
			if (ALT_PICK_TOOLS.includes(tool)) {
				_this.stop(e);
				picking = true;
				var picker = pick_tool();
				app.Tools.set_mouse_info(e);
				var mouse = picker.get_mouse_info(e);
				picker.pick_once(mouse.x, mouse.y);
			}
		}, true);
		document.addEventListener('mousemove', function (e) {
			if (!picking) return;
			_this.stop(e);
			var picker = pick_tool();
			app.Tools.set_mouse_info(e);
				var mouse = picker.get_mouse_info(e);
			picker.sample_at(mouse.x, mouse.y);
		}, true);
		document.addEventListener('mouseup', function (e) {
			if (!picking) return;
			picking = false;
			_this.stop(e);
			pick_tool().end();
		}, true);
	}

	on_key(event) {
		if (this.Helper.is_input(event.target) || event.target.isContentEditable) return;
		//dialogs handle their own keys
		if (document.querySelector('.adj_dialog') || document.querySelector('#popups .popup') || document.querySelector('.lq_root')) return;
		//text tool is typing
		if (config.TOOL && config.TOOL.name == 'text' && config.layer && config.layer.type == 'text'
			&& document.activeElement && document.activeElement.tagName == 'TEXTAREA') return;

		//free transform owns Enter, Esc, arrows and Ctrl+Z while active
		var transform = app.GUI.GUI_tools.tools_modules['transform'];
		if (transform && config.TOOL.name == 'transform' && transform.object.on_key(event)) {
			this.stop(event);
			return;
		}

		var key = event.key.length == 1 ? event.key.toLowerCase() : event.key;
		var ctrl = event.ctrlKey || event.metaKey;

		//crop tool: Enter applies, Esc cancels (Photoshop)
		if (config.TOOL.name == 'crop' && (key == 'Enter' || key == 'Escape')) {
			var crop = app.GUI.GUI_tools.tools_modules['crop'].object;
			if (crop.selection && crop.selection.width) {
				this.stop(event);
				if (key == 'Enter') crop.on_params_update();
				else {
					//Esc: back to the whole image
					crop.reset_full();
				}
				return;
			}
		}
		var combo = (ctrl ? 'ctrl+' : '') + (event.shiftKey ? 'shift+' : '') + (event.altKey ? 'alt+' : '') + key;
		//normalize modifier order used in table
		combo = combo.replace('ctrl+shift+alt+', 'ctrl+alt+shift+');

		var command = COMMANDS[combo];
		if (command) {
			this.stop(event);
			this.run(command[0], command[1]);
			return;
		}
		if (ctrl && key == 'd' && !event.shiftKey) {
			this.stop(event);
			this.run('select/select', 'deselect');
			return;
		}
		//selection aware commands
		var selection = app.GUI.modules['select/select'].Selection;
		var drawing_polygon = config.TOOL.name == 'polygon_lasso' && app.GUI.GUI_tools.tools_modules['polygon_lasso'].object.points;
		if (selection.has() && !drawing_polygon) {
			if (combo == 'ctrl+j') {
				this.stop(event);
				this.run('select/select', 'layer_via_copy');
				return;
			}
			if (combo == 'ctrl+c' || combo == 'ctrl+x') {
				this.stop(event);
				this.run('select/select', combo == 'ctrl+x' ? 'cut' : 'copy');
				return;
			}
			if ((key == 'Delete' || key == 'Backspace') && !ctrl && !event.altKey) {
				this.stop(event);
				this.run('select/select', 'clear');
				return;
			}
		}
		if (combo == 'ctrl+j') {
			this.stop(event);
			this.run('layer/duplicate', 'duplicate');
			return;
		}
		if (ctrl || event.altKey) return;

		if (key == '[' || key == ']') {
			this.stop(event);
			this.change_size(key == ']' ? 1 : -1, event.shiftKey);
			return;
		}
		if (key == 'r' && !event.shiftKey && !event.repeat) {
			//remember the tool: holding R while dragging returns to it
			this.r_hold = { previous: config.TOOL ? config.TOOL.name : null, used: false };
		}
		if (/^[a-z]$/.test(key) && app.GUI.GUI_tools.Toolbar.select_by_key(key, event.shiftKey)) {
			//tool group key, Shift = next tool of the group
			this.stop(event);
			return;
		}
		if (event.shiftKey) return;
		if (key == 'd') {
			this.stop(event);
			config.BG_COLOR = '#ffffff';
			app.GUI.GUI_colors.set_color({ hex: '#000000' });
			app.GUI.GUI_tools.Toolbar.render_colors();
			return;
		}
		if (key == 'x') {
			this.stop(event);
			var current = config.COLOR;
			app.GUI.GUI_colors.set_color({ hex: config.BG_COLOR || '#ffffff' });
			config.BG_COLOR = current;
			app.GUI.GUI_tools.Toolbar.render_colors();
			return;
		}
		//block old single letter shortcuts that mean something else in Photoshop
		if (/^[a-z]$/.test(key)) {
			this.stop(event);
		}
	}

	stop(event) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	run(module, fn) {
		var target = app.GUI.modules[module];
		if (target && typeof target[fn] == 'function') {
			new Actions_recorder_class().record_command(module, fn, null);
			if (is_guarded(module)) {
				run_guarded(function () { target[fn](); });
				return;
			}
			target[fn]();
		}
	}

	select_tool(name) {
		var button = document.getElementById(name);
		if (button) {
			button.click();
		}
	}

	/**
	 * [ and ] change brush size like in Photoshop (bigger steps for big brushes)
	 */
	change_size(direction, hardness) {
		if (!config.TOOL || !config.TOOL.attributes) return;
		var attributes = config.TOOL.attributes;
		var name = attributes.size !== undefined ? 'size' : (attributes.border_size !== undefined ? 'border_size' : null);
		if (!name || hardness) return;
		var item = attributes[name];
		var value = typeof item == 'object' ? item.value : item;
		var step = value < 10 ? 1 : value < 50 ? 5 : value < 100 ? 10 : 25;
		value = Math.max(1, Math.min(999, value + direction * step));
		if (typeof item == 'object') item.value = value;
		else attributes[name] = value;
		app.GUI.GUI_tools.show_action_attributes();
	}
}

export default Shortcuts_class;
