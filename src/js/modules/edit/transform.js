import app from './../../app.js';

var instance = null;

/**
 * Edit > Free Transform (Ctrl+T) and Edit > Transform commands
 */
class Edit_transform_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;
	}

	tool() {
		return app.GUI.GUI_tools.tools_modules['transform'].object;
	}

	free_transform() {
		this.tool().start();
	}

	rotate_180() {
		var tool = this.tool();
		tool.command(function () { tool.rotate_by(180); });
	}

	rotate_cw() {
		var tool = this.tool();
		tool.command(function () { tool.rotate_by(90); });
	}

	rotate_ccw() {
		var tool = this.tool();
		tool.command(function () { tool.rotate_by(-90); });
	}

	mode(name) {
		var tool = this.tool();
		if (!tool.session && !tool.start()) return;
		tool.session.mode = name;
		if (name == 'warp') tool.start_warp();
	}

	skew() { this.mode('skew'); }
	distort() { this.mode('distort'); }
	perspective() { this.mode('perspective'); }
	warp() { this.mode('warp'); }

	flip_horizontal() {
		var tool = this.tool();
		tool.command(function () { tool.flip(true); });
	}

	flip_vertical() {
		var tool = this.tool();
		tool.command(function () { tool.flip(false); });
	}
}

export default Edit_transform_class;
