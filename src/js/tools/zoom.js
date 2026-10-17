import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { zoom_at, set_cursor } from './../core/view-nav.js';

/**
 * Zoom tool (Z): click = zoom in, Alt + click = zoom out
 */
class Zoom_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'zoom';
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			zoom_at(e, e.altKey ? -1 : 1);
		});
		document.addEventListener('keydown', function (e) {
			if (config.TOOL.name == _this.name && e.key == 'Alt') set_cursor('zoom-out');
		});
		document.addEventListener('keyup', function (e) {
			if (config.TOOL.name == _this.name && e.key == 'Alt') set_cursor('zoom-in');
		});
	}

	on_activate() {
		set_cursor('zoom-in');
	}
}

export default Zoom_class;
