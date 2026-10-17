import app from './../../app.js';

/**
 * Window menu: show / close panels, reset workspace
 */
class Window_workspace_class {

	ws() {
		return app.GUI.Workspace;
	}

	toggle_layers() { this.ws().toggle_panel('layers'); }
	toggle_color() { this.ws().toggle_panel('color'); }
	toggle_swatches() { this.ws().toggle_panel('swatches'); }
	toggle_properties() { this.ws().toggle_panel('properties'); }
	toggle_adjustments() { this.ws().toggle_panel('adjustments'); }
	toggle_history() { this.ws().toggle_panel('history'); }
	toggle_navigator() { this.ws().toggle_panel('navigator'); }
	toggle_info() { this.ws().toggle_panel('info'); }
	toggle_actions() { this.ws().toggle_panel('actions'); }
	toggle_channels() { this.ws().toggle_panel('channels'); }
	toggle_paths() { this.ws().toggle_panel('paths'); }
	toggle_character() { this.ws().toggle_panel('character'); }
	toggle_paragraph() { this.ws().toggle_panel('paragraph'); }

	toggle_all() {
		var ws = this.ws();
		ws.layout.hidden_all = !ws.layout.hidden_all;
		ws.save();
		ws.apply_visibility();
		ws.notify_resize();
	}

	reset() {
		this.ws().reset();
	}
}

export default Window_workspace_class;
