import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { pan_by, track_drag, set_cursor } from './../core/view-nav.js';

/**
 * Hand tool (H): drag to scroll the view
 */
class Hand_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'hand';
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			set_cursor('grabbing');
			track_drag(e, pan_by, function () {
				set_cursor('grab');
			});
		});
	}

	on_activate() {
		set_cursor('grab');
	}
}

export default Hand_class;
