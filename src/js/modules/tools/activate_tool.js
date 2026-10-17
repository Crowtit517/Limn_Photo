import app from './../../app.js';

/**
 * Opens tools that are not shown in the tools panel (menu entry points)
 */
class Tools_activate_tool_class {

	activate(name) {
		app.GUI.GUI_tools.activate_tool(name);
	}
}

export default Tools_activate_tool_class;
