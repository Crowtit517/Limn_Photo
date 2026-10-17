import { save_selection } from './../../core/gui/doc-panels.js';
import { warp_text } from './../../core/gui/character-panel.js';

/**
 * Select > Save Selection, Type > Warp Text (menu entry points)
 */
class Select_channels_class {

	save() {
		save_selection();
	}

	warp_text() {
		warp_text();
	}
}

export default Select_channels_class;
