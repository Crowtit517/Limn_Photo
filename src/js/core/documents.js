/*
 * Several open documents (Photoshop document tabs). The editor works on one global document,
 * so switching tabs swaps the whole document state (layers, size, history, selection, paths...).
 */
import app from './../app.js';
import config from './../config.js';
import Pixel_selection_class from './pixel-selection.js';
import { ask_save } from './gui/confirm-close.js';

var docs = [];
var active = 0;
var counter = 1;

function selection() {
	return new Pixel_selection_class();
}

function capture() {
	var sel = selection();
	return {
		layers: config.layers,
		layer: config.layer,
		WIDTH: config.WIDTH,
		HEIGHT: config.HEIGHT,
		TRANSPARENCY: config.TRANSPARENCY,
		auto_increment: app.Layers.auto_increment,
		history: app.State.action_history,
		index: app.State.action_history_index,
		saved_action: app.State.saved_action,
		mask: sel.mask,
		last_mask: sel.last_mask,
		ALPHA_CHANNELS: config.ALPHA_CHANNELS,
		PATHS: config.PATHS,
		BIT_DEPTH: config.BIT_DEPTH,
		PATH_SELECTED: config.PATH_SELECTED,
		CHANNEL_VIEW: config.CHANNEL_VIEW,
	};
}

async function restore(state) {
	config.layers = state.layers;
	config.layer = state.layer;
	config.WIDTH = state.WIDTH;
	config.HEIGHT = state.HEIGHT;
	config.TRANSPARENCY = state.TRANSPARENCY;
	app.Layers.auto_increment = state.auto_increment;
	app.State.action_history = state.history;
	app.State.action_history_index = state.index;
	app.State.saved_action = state.saved_action;
	config.ALPHA_CHANNELS = state.ALPHA_CHANNELS;
	config.PATHS = state.PATHS;
	config.BIT_DEPTH = state.BIT_DEPTH || 8;
	config.PATH_SELECTED = state.PATH_SELECTED;
	config.CHANNEL_VIEW = state.CHANNEL_VIEW;
	var sel = selection();
	sel.last_mask = state.last_mask;
	sel.apply(state.mask || null);
	await refresh();
}

async function refresh() {
	app.GUI.prepare_canvas();
	config.need_render = true;
	app.GUI.GUI_layers.render_layers();
	app.GUI.GUI_tools.show_action_attributes();
	window.dispatchEvent(new Event('photolab-history'));
	window.dispatchEvent(new Event('resize'));
	await new Promise(function (r) { setTimeout(r, 30); });
	app.GUI.GUI_preview.zoom_auto(true);
	config.need_render = true;
}

function ensure_list() {
	if (!docs.length) docs.push({ id: counter++, state: null, title: '' });
}

/**
 * title of a document: first image layer name or "제목 없음-N"
 */
export function doc_title(state, id) {
	var layers = state ? state.layers : config.layers;
	var image = (layers || []).find(function (l) { return l.type == 'image' && /\.(png|jpe?g|webp|gif|bmp|psd|tiff?)$/i.test(l.name || ''); });
	return image ? image.name : '제목 없음-' + id;
}

/**
 * last history step that is stored in a file (saved / exported)
 */
export function mark_saved() {
	app.State.saved_action = app.State.action_history[app.State.action_history_index - 1] || null;
}

/**
 * changes since the last save? Opening a file is not a change (Photoshop)
 */
function dirty(history, index, saved) {
	var start = 0;
	if (saved) {
		var at = history.indexOf(saved);
		//saved step dropped from history or undone past it
		if (at < 0 || at >= index) return at != index - 1;
		start = at + 1;
	}
	for (var i = start; i < index; i++) {
		if (!/^(open_|new_file)/.test(history[i].action_id)) return true;
	}
	return false;
}

export function is_dirty(index) {
	ensure_list();
	if (index == null || index == active) {
		return !is_empty() && dirty(app.State.action_history, app.State.action_history_index, app.State.saved_action);
	}
	var state = docs[index] && docs[index].state;
	return !!state && dirty(state.history || [], state.index || 0, state.saved_action);
}

/**
 * asks 저장 / 저장 안 함 / 취소 for a document with changes; false = keep it open
 */
async function confirm_close(index) {
	if (!is_dirty(index)) return true;
	if (index != active) await switch_to(index);
	var answer = await ask_save(doc_title(null, docs[active].id));
	if (answer == 'cancel') return false;
	if (answer == 'save') {
		await app.GUI.modules['file/psd'].save();
		mark_saved();
	}
	return true;
}

/**
 * closing the app window: every document with changes is asked about
 */
export async function confirm_quit() {
	ensure_list();
	for (var i = 0; i < docs.length; i++) {
		if (!await confirm_close(i)) return false;
	}
	return true;
}

export function list_documents() {
	ensure_list();
	return docs.map(function (d, i) {
		return { id: d.id, index: i, active: i == active, title: i == active ? doc_title(null, d.id) : doc_title(d.state, d.id) };
	});
}

export function is_empty() {
	return !config.layers.length || config.layers.every(function (l) { return l.type == null; });
}

/**
 * finish a running free transform before the document changes under it
 */
async function settle() {
	var transform = app.GUI.GUI_tools.tools_modules['transform'];
	if (transform && transform.object.session) await transform.object.finish(true);
	//an open adjustment / filter dialog belongs to this document (Photoshop dialogs are modal): cancel it
	var open = document.querySelectorAll('.adj_dialog [data-act=cancel]');
	if (open.length) {
		open.forEach(function (button) { button.click(); });
		await new Promise(function (resolve) { setTimeout(resolve, 60); });
	}
	await app.State.wait_idle();
}

/**
 * opens a fresh empty document in a new tab (same size as the current one)
 */
export async function new_tab() {
	ensure_list();
	await settle();
	docs[active].state = capture();
	docs.push({ id: counter++, state: null });
	active = docs.length - 1;
	config.layers = [];
	config.layer = null;
	app.Layers.auto_increment = 1;
	app.State.action_history = [];
	app.State.action_history_index = 0;
	config.ALPHA_CHANNELS = [];
	config.PATHS = [];
	config.BIT_DEPTH = 8;
	config.PATH_SELECTED = -1;
	config.CHANNEL_VIEW = 'rgb';
	var sel = selection();
	sel.last_mask = null;
	sel.apply(null);
	await new app.Actions.Insert_layer_action({}).do();
	await refresh();
	notify();
}

/**
 * new tab only when the current document already has content (Photoshop opens files in new tabs)
 */
export async function new_tab_if_needed() {
	if (!is_empty()) await new_tab();
}

export async function switch_to(index) {
	ensure_list();
	if (index == active || !docs[index]) return;
	await settle();
	docs[active].state = capture();
	active = index;
	await restore(docs[index].state);
	notify();
}

export async function close(index) {
	ensure_list();
	if (index == null) index = active;
	await settle();
	if (!await confirm_close(index)) return;
	index = Math.min(index, docs.length - 1);
	if (docs.length == 1) {
		//last document: start over with an empty one
		docs = [];
		ensure_list();
		active = 0;
		config.layers = [];
		app.Layers.auto_increment = 1;
		app.State.action_history = [];
		app.State.action_history_index = 0;
		selection().apply(null);
		await new app.Actions.Insert_layer_action({}).do();
		await refresh();
		notify();
		return;
	}
	if (index != active) {
		docs.splice(index, 1);
		if (index < active) active--;
		notify();
		return;
	}
	docs.splice(index, 1);
	active = Math.max(0, index - 1);
	await restore(docs[active].state);
	notify();
}

export function next(direction) {
	ensure_list();
	if (docs.length < 2) return;
	switch_to((active + direction + docs.length) % docs.length);
}

function notify() {
	window.dispatchEvent(new Event('photolab-documents'));
}

//desktop app: closing the window asks about unsaved documents first
if (typeof window != 'undefined' && window.__TAURI__ && window.__TAURI__.window) {
	var app_window = window.__TAURI__.window.getCurrentWindow();
	app_window.onCloseRequested(async function (event) {
		event.preventDefault();
		if (await confirm_quit()) await app_window.destroy();
	});
}
