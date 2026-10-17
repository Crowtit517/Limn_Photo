/**
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

//css
import './../css/reset.css';
import './../css/utility.css';
import './../css/component.css';
import './../css/layout.css';
import './../css/menu.css';
import './../css/print.css';
import './../css/pro.css';
import './../css/workspace.css';
import './../../node_modules/alertifyjs/build/css/alertify.min.css';
//js
import app from './app.js';
import config from './config.js';
import './core/components/index.js';
import Base_gui_class from './core/base-gui.js';
import Base_layers_class from './core/base-layers.js';
import Base_tools_class from './core/base-tools.js';
import Base_state_class from './core/base-state.js';
import Base_search_class from './core/base-search.js';
import File_open_class from './modules/file/open.js';
import File_save_class from './modules/file/save.js';
import Raster_commit_class from './core/raster-commit.js';
import Shortcuts_class from './core/shortcuts.js';
import Pixel_selection_class from './core/pixel-selection.js';
import * as Actions from './actions/index.js';
import { init_layer_locks } from './core/layer-locks.js';

window.addEventListener('load', function (e) {
	// Initiate app
	var Layers = new Base_layers_class();
	var Base_tools = new Base_tools_class(true);
	var GUI = new Base_gui_class();
	var Base_state = new Base_state_class();
	var File_open = new File_open_class();
	var File_save = new File_save_class();
	var Base_search = new Base_search_class();
	//shortcuts first: its Alt+click capture handler must run before the paint commit one
	var Shortcuts = new Shortcuts_class();
	var Raster_commit = new Raster_commit_class();

	// Register singletons in app module
	app.Actions = Actions;
	app.Config = config;
	app.FileOpen = File_open;
	app.FileSave = File_save;
	app.GUI = GUI;
	app.Layers = Layers;
	app.State = Base_state;
	app.Tools = Base_tools;

	// Register as global for quick or external access
	window.Layers = Layers;
	window.AppConfig = config;
	window.App = app;
	init_layer_locks();
	window.State = Base_state;
	window.FileOpen = File_open;
	window.FileSave = File_save;
	window.RasterCommit = Raster_commit;
	window.PixelSelection = new Pixel_selection_class();

	// Render all
	GUI.init();
	Layers.init();
}, false);
