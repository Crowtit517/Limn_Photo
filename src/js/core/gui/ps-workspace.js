/*
 * Photoshop style workspace:
 * - right dock with tabbed panel groups (Color/Swatches, Properties/Adjustments, Layers)
 * - collapsed panel icons (History, Navigator, Info) that open as flyouts
 * - drag a tab to another group, to the icon strip, or out of the dock to float it
 * - resize dock width and group heights, double click a tab bar to collapse a group
 * - document tab above the canvas and status bar below it
 * - Window menu commands, F6/F7/F8, Tab / Shift+Tab hide panels; layout is remembered
 */
import app from './../../app.js';
import config from './../../config.js';
import Actions_recorder_class from './../actions-recorder.js';
import { create_channels_panel, create_paths_panel } from './doc-panels.js';
import { create_character_panel, create_paragraph_panel } from './character-panel.js';
import { list_documents, switch_to as switch_document, close as close_document, next as next_document } from './../documents.js';

const STORAGE_KEY = 'photolab_workspace_v1';
const MIN_WIDTH = 220, MAX_WIDTH = 560;

const ICONS = {
	color: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.2-1.7-.5-1 .1-2.3 1.4-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.5" cy="11" r="1.4"/><circle cx="10" cy="7" r="1.4"/><circle cx="14.5" cy="7" r="1.4"/></svg>',
	swatches: '<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
	properties: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	adjustments: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 0 0 0 16z"/></svg>',
	layers: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 13l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	history: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
	navigator: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="9" width="7" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	channels: '<svg viewBox="0 0 24 24"><circle cx="9" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="15" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
	paths: '<svg viewBox="0 0 24 24"><path d="M4 18C8 4 16 20 20 6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="16.5" width="3" height="3"/><rect x="18.5" y="4.5" width="3" height="3"/></svg>',
	character: '<svg viewBox="0 0 24 24"><path d="M5 20L11 4h2l6 16M8 14h8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
	paragraph: '<svg viewBox="0 0 24 24"><path d="M10 4h9M14 4v16M17 4v16M10 4a4 4 0 0 0 0 8h4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
	actions: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
	info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2"/></svg>',
};

// id -> [title, shortcut label]
const PANELS = {
	color: ['색상', 'F6'],
	swatches: ['견본', ''],
	properties: ['속성', ''],
	adjustments: ['조정', ''],
	layers: ['레이어', 'F7'],
	history: ['작업 내역', ''],
	navigator: ['내비게이터', ''],
	info: ['정보', 'F8'],
	actions: ['액션', 'Alt+F9'],
	channels: ['채널', ''],
	paths: ['패스', ''],
	character: ['문자', ''],
	paragraph: ['단락', ''],
};

const DEFAULT_LAYOUT = {
	width: 300,
	icons: ['history', 'navigator', 'info', 'actions', 'character', 'paragraph'],
	groups: [
		{ panels: ['color', 'swatches'], active: 'color', height: 250, collapsed: false },
		{ panels: ['properties', 'adjustments'], active: 'adjustments', height: 190, collapsed: false },
		{ panels: ['layers', 'channels', 'paths'], active: 'layers', height: 0, collapsed: false },
	],
	floating: [],
	//second dock column left of the canvas (empty by default, Photoshop can dock panels on both sides)
	left: { groups: [], width: 260 },
	//tools bar: left | right | float, options bar: top | bottom | float (Photoshop lets both move)
	tools: { pos: 'left', x: 60, y: 120, cols: 1 },
	options: { pos: 'top', x: 200, y: 70 },
	hidden_all: false,
	hidden_dock: false,
};

const ADJUSTMENTS = [
	['brightness_contrast', '명도/대비', '<path d="M12 4v16M12 4a8 8 0 0 1 0 16" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
	['levels', '레벨', '<path d="M3 20h18M5 20V12M9 20V6M13 20V9M17 20V14" stroke="currentColor" stroke-width="2.2" fill="none"/>'],
	['curves', '곡선', '<path d="M4 20C9 20 9 4 20 4" stroke="currentColor" stroke-width="1.8" fill="none"/><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2"/>'],
	['hue_saturation', '색조/채도', '<path d="M4 18h16" stroke="url(#ws_hue)" stroke-width="4"/><path d="M6 13l6-8 6 8z" fill="currentColor"/><defs><linearGradient id="ws_hue"><stop offset="0" stop-color="#f33"/><stop offset=".33" stop-color="#3f3"/><stop offset=".66" stop-color="#33f"/><stop offset="1" stop-color="#f3f"/></linearGradient></defs>'],
	['black_white', '흑백', '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 20L20 4v16z" fill="currentColor"/>'],
	['invert', '반전', '<rect x="4" y="4" width="8" height="16" fill="currentColor"/><rect x="12" y="4" width="8" height="16" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
	['color_balance', '색상 균형', '<path d="M12 3v18M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z" fill="none" stroke="currentColor" stroke-width="1.5"/>'],
	['selective_color', '선택 색상', '<circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>'],
	['gradient_map', '그레이디언트 맵', '<defs><linearGradient id="ws_gm"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="3" y="7" width="18" height="10" fill="url(#ws_gm)" stroke="currentColor" stroke-width="1"/>'],
	['exposure', '노출', '<path d="M4 20L20 4M7 7h4M9 5v4M13 17h4" stroke="currentColor" stroke-width="1.6" fill="none"/>'],
	['vibrance', '활기', '<path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9v7" stroke="currentColor" stroke-width="1.6"/>'],
	['photo_filter', '포토 필터', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3"/>'],
	['channel_mixer', '채널 혼합', '<path d="M6 4v16M12 4v16M18 4v16" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="8" width="4" height="3" fill="currentColor"/><rect x="10" y="13" width="4" height="3" fill="currentColor"/><rect x="16" y="6" width="4" height="3" fill="currentColor"/>'],
	['color_lookup', '색상 검색', '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="1.2"/>'],
];

function el(tag, cls, html) {
	var e = document.createElement(tag);
	if (cls) e.className = cls;
	if (html != null) e.innerHTML = html;
	return e;
}

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

class Ps_workspace_class {

	constructor() {
		this.panels = {};
		this.layout = null;
		this.flyout = null;
	}

	init() {
		this.sidebar = document.querySelector('.sidebar_right');
		if (!this.sidebar) return;
		this.create_panels();
		this.layout = this.load();
		this.sidebar.innerHTML = '';
		this.sidebar.classList.add('ws_dock');
		this.left_dock = el('div', 'ws_dock_left ws_empty');
		var wrapper = document.querySelector('.wrapper');
		wrapper.classList.add('ws-grid');
		wrapper.appendChild(this.left_dock);
		this.render();
		this.create_document_bars();
		this.create_bar_grips();
		this.apply_bars();
		this.set_events();
		this.apply_visibility();
		this.notify_resize();
	}

	// ----------------- panels -----------------

	create_panels() {
		var take = function (id) {
			var node = document.getElementById(id);
			if (node) node.classList.remove('hidden');
			return node;
		};
		this.add_panel('color', take('toggle_colors'));
		this.add_panel('swatches', this.create_swatches());
		this.add_panel('properties', this.create_properties(take('toggle_details')));
		this.add_panel('adjustments', this.create_adjustments());
		this.add_panel('layers', take('layers_base'));
		this.add_panel('history', take('toggle_history'));
		this.add_panel('navigator', take('toggle_preview'));
		this.add_panel('info', take('toggle_info'));
		this.add_panel('actions', new Actions_recorder_class().create_panel());
		this.add_panel('channels', create_channels_panel());
		this.add_panel('paths', create_paths_panel());
		this.add_panel('character', create_character_panel());
		this.add_panel('paragraph', create_paragraph_panel());
	}

	add_panel(id, content) {
		var wrap = el('div', 'ws_panel ws_panel_' + id);
		wrap.dataset.panel = id;
		if (content) wrap.appendChild(content);
		this.panels[id] = wrap;
	}

	create_swatches() {
		var box = el('div', 'ws_swatches');
		var colors = [];
		for (var i = 0; i <= 10; i++) {
			var v = Math.round(255 * i / 10);
			colors.push('rgb(' + v + ',' + v + ',' + v + ')');
		}
		colors.push('#ffffff');
		var lightness = [30, 45, 55, 70, 85];
		for (var l = 0; l < lightness.length; l++) {
			for (var h = 0; h < 360; h += 30) {
				colors.push('hsl(' + h + ',' + (lightness[l] > 80 ? 70 : 90) + '%,' + lightness[l] + '%)');
			}
		}
		var probe = document.createElement('canvas').getContext('2d');
		colors.forEach(function (color) {
			probe.fillStyle = color;
			var hex = probe.fillStyle;
			var sw = el('button', 'ws_swatch');
			sw.type = 'button';
			sw.style.background = hex;
			sw.title = hex + ' (클릭: 전경색, Ctrl+클릭: 배경색)';
			sw.dataset.hex = hex;
			box.appendChild(sw);
		});
		box.addEventListener('click', function (e) {
			var sw = e.target.closest('.ws_swatch');
			if (!sw) return;
			if (e.ctrlKey || e.metaKey) {
				config.BG_COLOR = sw.dataset.hex;
			}
			else {
				app.GUI.GUI_colors.set_color({ hex: sw.dataset.hex });
			}
			app.GUI.GUI_tools.Toolbar.render_colors();
		});
		return box;
	}

	create_adjustments() {
		var box = el('div', 'ws_adjust');
		box.appendChild(el('div', 'ws_adjust_title', '조정 레이어 추가'));
		var grid = el('div', 'ws_adjust_grid');
		ADJUSTMENTS.forEach(function (item) {
			var button = el('button', 'ws_adjust_btn', '<svg viewBox="0 0 24 24">' + item[2] + '</svg><span>' + item[1] + '</span>');
			button.type = 'button';
			button.title = item[1] + ' 조정 레이어';
			button.addEventListener('click', function () {
				app.GUI.modules['layer/adjustment'][item[0]]();
			});
			grid.appendChild(button);
		});
		box.appendChild(grid);
		return box;
	}

	create_properties(details) {
		var box = el('div', 'ws_props');
		var head = el('div', 'ws_props_head');
		box.appendChild(head);
		if (details) box.appendChild(details);
		var last = '';
		setInterval(function () {
			var layer = config.layer;
			var key = layer ? layer.id + ':' + layer.type + ':' + layer.name : '';
			if (key == last) return;
			last = key;
			head.innerHTML = '';
			if (!layer) return;
			var kind = layer.type == 'adjustment' ? '조정 레이어' : layer.type == 'image' ? '픽셀 레이어'
				: layer.type == 'text' ? '문자 레이어' : layer.type == null ? '빈 레이어' : '도형 레이어';
			head.appendChild(el('div', 'ws_props_kind', kind));
			if (layer.type == 'adjustment') {
				var button = el('button', 'ws_props_btn', '조정 설정 편집...');
				button.type = 'button';
				button.addEventListener('click', function () {
					app.GUI.modules['layer/adjustment'].edit(config.layer);
				});
				head.appendChild(button);
			}
		}, 300);
		return box;
	}

	// ----------------- layout state -----------------

	load() {
		var layout = null;
		try {
			var saved = localStorage.getItem(STORAGE_KEY);
			if (saved) layout = JSON.parse(saved);
		}
		catch (e) {
			layout = null;
		}
		if (!layout || !Array.isArray(layout.groups)) layout = clone(DEFAULT_LAYOUT);
		//drop unknown panels, keep each panel in one place only
		var seen = {};
		var keep = function (id) {
			if (!PANELS[id] || seen[id]) return false;
			seen[id] = true;
			return true;
		};
		layout.icons = (layout.icons || []).filter(keep);
		layout.groups.forEach(function (g) { g.panels = (g.panels || []).filter(keep); });
		layout.groups = layout.groups.filter(function (g) { return g.panels.length; });
		layout.left = Object.assign({ groups: [], width: 260 }, layout.left || {});
		layout.left.groups.forEach(function (g) { g.panels = (g.panels || []).filter(keep); });
		layout.left.groups = layout.left.groups.filter(function (g) { return g.panels.length; });
		layout.left.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, layout.left.width || 260));
		//floating windows hold tab groups (older layouts: one panel each)
		layout.floating = (layout.floating || []).map(function (f) {
			var panels = (f.panels || (f.panel ? [f.panel] : [])).filter(keep);
			return Object.assign({}, f, { panels: panels, active: panels.indexOf(f.active) >= 0 ? f.active : panels[0], panel: undefined });
		}).filter(function (f) { return f.panels.length; });
		layout.tools = Object.assign({}, DEFAULT_LAYOUT.tools, layout.tools || {});
		layout.options = Object.assign({}, DEFAULT_LAYOUT.options, layout.options || {});
		layout.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, layout.width || DEFAULT_LAYOUT.width));
		//panels added in newer versions appear as icons once
		var known = layout.known || ['color', 'swatches', 'properties', 'adjustments', 'layers', 'history', 'navigator', 'info'];
		var new_in_layers = ['channels', 'paths'];
		Object.keys(PANELS).forEach(function (id) {
			if (known.indexOf(id) >= 0 || seen[id]) return;
			//new Photoshop-default panels join the Layers group
			var layers_group = new_in_layers.indexOf(id) >= 0 && layout.groups.find(function (g) { return g.panels.indexOf('layers') >= 0; });
			if (layers_group) layers_group.panels.push(id);
			else layout.icons.push(id);
		});
		layout.known = Object.keys(PANELS);
		return layout;
	}

	save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout));
		}
		catch (e) {
			//storage blocked - layout lasts for this session only
		}
	}

	reset() {
		this.layout = clone(DEFAULT_LAYOUT);
		this.save();
		this.render();
		this.apply_bars();
		this.apply_visibility();
		this.notify_resize();
	}

	location_of(id) {
		var layout = this.layout;
		if (layout.icons.indexOf(id) >= 0) return { type: 'icon' };
		for (var i = 0; i < layout.groups.length; i++) {
			if (layout.groups[i].panels.indexOf(id) >= 0) return { type: 'group', side: 'right', index: i };
		}
		for (var k = 0; k < layout.left.groups.length; k++) {
			if (layout.left.groups[k].panels.indexOf(id) >= 0) return { type: 'group', side: 'left', index: k };
		}
		for (var j = 0; j < layout.floating.length; j++) {
			if (layout.floating[j].panels.indexOf(id) >= 0) return { type: 'float', index: j };
		}
		return null;
	}

	remove_from_layout(id) {
		var layout = this.layout;
		layout.icons = layout.icons.filter(function (p) { return p != id; });
		[layout.groups, layout.left.groups].forEach(function (groups) {
			groups.forEach(function (g) {
				g.panels = g.panels.filter(function (p) { return p != id; });
				if (g.active == id) g.active = g.panels[0];
			});
		});
		layout.groups = layout.groups.filter(function (g) { return g.panels.length; });
		layout.left.groups = layout.left.groups.filter(function (g) { return g.panels.length; });
		layout.floating.forEach(function (f) {
			f.panels = f.panels.filter(function (p) { return p != id; });
			if (f.active == id) f.active = f.panels[0];
		});
		layout.floating = layout.floating.filter(function (f) { return f.panels.length; });
		if (this.flyout == id) this.flyout = null;
	}

	// ----------------- rendering -----------------

	render() {
		var _this = this;
		var layout = this.layout;
		//panels not shown stay in the document (hidden) so their code keeps finding elements by id
		if (!this.store) {
			this.store = el('div', 'ws_store');
			document.body.appendChild(this.store);
		}
		Object.keys(this.panels).forEach(function (id) {
			_this.store.appendChild(_this.panels[id]);
		});
		document.querySelectorAll('.ws_float, .ws_flyout').forEach(function (node) { node.remove(); });
		this.sidebar.innerHTML = '';

		//collapsed icons
		var iconbar = el('div', 'ws_iconbar');
		layout.icons.forEach(function (id) {
			var button = el('button', 'ws_icon' + (_this.flyout == id ? ' open' : ''), ICONS[id]);
			button.type = 'button';
			button.dataset.panel = id;
			button.title = PANELS[id][0] + (PANELS[id][1] ? ' (' + PANELS[id][1] + ')' : '');
			iconbar.appendChild(button);
		});
		if (layout.icons.length) this.sidebar.appendChild(iconbar);

		//dock columns (right, and left of the canvas)
		this.sidebar.appendChild(this.render_column('right'));
		this.left_dock.innerHTML = '';
		if (layout.left.groups.length) this.left_dock.appendChild(this.render_column('left'));
		this.left_dock.classList.toggle('ws_empty', !layout.left.groups.length);

		//floating panels
		layout.floating.forEach(function (f, index) {
			var node = _this.render_group({ panels: f.panels, active: f.active || f.panels[0] }, 'float', index);
			node.classList.add('ws_float');
			node.style.left = Math.max(0, Math.min(window.innerWidth - 120, f.x)) + 'px';
			node.style.top = Math.max(30, Math.min(window.innerHeight - 60, f.y)) + 'px';
			node.style.width = (f.w || 260) + 'px';
			node.style.height = (f.h || 300) + 'px';
			var close = el('button', 'ws_close', '×');
			close.type = 'button';
			close.title = '닫기';
			node.querySelector('.ws_tabs').appendChild(close);
			document.body.appendChild(node);
		});

		//icon flyout
		if (this.flyout && layout.icons.indexOf(this.flyout) >= 0) {
			var fly = el('div', 'ws_flyout');
			var head = el('div', 'ws_tabs', '<span class="ws_tab active" data-panel="' + this.flyout + '">' + PANELS[this.flyout][0] + '</span>');
			fly.appendChild(head);
			var body = el('div', 'ws_body');
			body.appendChild(this.panels[this.flyout]);
			this.panels[this.flyout].style.display = '';
			fly.appendChild(body);
			document.body.appendChild(fly);
			var rect = this.sidebar.getBoundingClientRect();
			var button_rect = iconbar.querySelector('[data-panel="' + this.flyout + '"]').getBoundingClientRect();
			fly.style.right = (window.innerWidth - rect.left + 4) + 'px';
			fly.style.top = Math.max(34, Math.min(window.innerHeight - 340, button_rect.top)) + 'px';
		}
		this.save();
		app.GUI && app.GUI.GUI_preview && (config.need_render = true);
	}

	groups_of(side) {
		return side == 'left' ? this.layout.left.groups : this.layout.groups;
	}

	render_column(side) {
		var _this = this;
		var groups = this.groups_of(side);
		var column = el('div', 'ws_column');
		column.dataset.side = side;
		column.style.width = (side == 'left' ? this.layout.left.width : this.layout.width) + 'px';
		var handle = el('div', 'ws_resize_w');
		handle.dataset.side = side;
		column.appendChild(handle);
		groups.forEach(function (group, index) {
			var is_last = index == groups.length - 1;
			var node = _this.render_group(group, side == 'left' ? 'dockL' : 'dock', index);
			if (group.collapsed) node.classList.add('collapsed');
			else if (is_last || !group.height) node.classList.add('fill');
			else node.style.height = group.height + 'px';
			column.appendChild(node);
			if (!is_last) {
				var split = el('div', 'ws_split');
				split.dataset.index = index;
				split.dataset.side = side;
				column.appendChild(split);
			}
		});
		return column;
	}

	render_group(group, where, index) {
		var _this = this;
		var node = el('div', 'ws_group');
		node.dataset.where = where;
		node.dataset.index = index;
		var tabs = el('div', 'ws_tabs');
		group.panels.forEach(function (id) {
			var tab = el('span', 'ws_tab' + (id == group.active ? ' active' : ''), PANELS[id][0]);
			tab.dataset.panel = id;
			tab.title = PANELS[id][0] + (PANELS[id][1] ? ' (' + PANELS[id][1] + ')' : '') + ' - 끌어서 옮기기';
			tabs.appendChild(tab);
		});
		node.appendChild(tabs);
		var body = el('div', 'ws_body');
		group.panels.forEach(function (id) {
			var panel = _this.panels[id];
			panel.style.display = id == group.active ? '' : 'none';
			body.appendChild(panel);
		});
		node.appendChild(body);
		return node;
	}

	create_document_bars() {
		var middle = document.getElementById('middle_area');
		if (!middle || document.getElementById('ws_doctabs')) return;
		middle.classList.add('ws_has_bars');
		var tabs = el('div', 'ws_doctabs');
		tabs.id = 'ws_doctabs';
		middle.insertBefore(tabs, middle.firstChild);
		var render_tabs = function () {
			var percent = Math.round((config.ZOOM || 1) * 1000) / 10;
			var layer = config.layer ? config.layer.name : '';
			tabs.innerHTML = '';
			list_documents().forEach(function (d) {
				var tab = el('span', 'ws_doctab' + (d.active ? ' active' : ''));
				var text = d.active ? d.title + ' @ ' + percent + '% (' + layer + ', RGB/' + (d.active ? (config.BIT_DEPTH || 8) : 8) + ')' : d.title;
				tab.innerHTML = '<span class="ws_doctab_title"></span><button type="button" class="ws_doctab_close" title="닫기 (Ctrl+W)">×</button>';
				tab.querySelector('.ws_doctab_title').textContent = text;
				tab.title = text;
				tab.dataset.index = d.index;
				tabs.appendChild(tab);
			});
		};
		tabs.addEventListener('mousedown', function (e) {
			var tab = e.target.closest('.ws_doctab');
			if (!tab) return;
			if (e.target.closest('.ws_doctab_close')) close_document(parseInt(tab.dataset.index));
			else switch_document(parseInt(tab.dataset.index));
		});
		window.addEventListener('photolab-documents', function () { last = ''; });

		var status = el('div', 'ws_status');
		status.id = 'ws_status';
		status.innerHTML = '<input type="text" class="ws_zoom" title="확대/축소 (Enter)"><span class="ws_docsize"></span>';
		middle.appendChild(status);

		var zoom = status.querySelector('.ws_zoom');
		zoom.addEventListener('keydown', function (e) {
			e.stopPropagation();
			if (e.key == 'Enter') {
				var value = parseFloat(zoom.value);
				if (value > 0) {
					app.GUI.GUI_preview.set_center_zoom();
					app.GUI.GUI_preview.zoom(Math.max(1, Math.min(3200, value)));
				}
				zoom.blur();
			}
		});
		var last = '';
		setInterval(function () {
			var percent = Math.round((config.ZOOM || 1) * 1000) / 10;
			var layer = config.layer ? config.layer.name : '';
			var key = JSON.stringify(list_documents()) + percent + layer + '|' + config.WIDTH + 'x' + config.HEIGHT + '|' + config.BIT_DEPTH;
			if (key == last) return;
			last = key;
			render_tabs();
			if (document.activeElement !== zoom) zoom.value = percent + '%';
			status.querySelector('.ws_docsize').textContent = config.WIDTH + ' × ' + config.HEIGHT + ' 픽셀 (72 ppi)';
		}, 250);
	}

	// ----------------- visibility -----------------

	apply_visibility() {
		var layout = this.layout;
		document.body.classList.toggle('ws_hide_all', !!layout.hidden_all);
		document.body.classList.toggle('ws_hide_dock', !!layout.hidden_dock && !layout.hidden_all);
	}

	notify_resize() {
		setTimeout(function () {
			window.dispatchEvent(new Event('resize'));
		}, 30);
	}

	/**
	 * Window menu: show panel (bring to front) or close it
	 */
	toggle_panel(id) {
		var location = this.location_of(id);
		if (location) {
			//visible in a group but not active: just activate it
			if (location.type == 'group') {
				var group = this.groups_of(location.side)[location.index];
				if (group.active != id || group.collapsed) {
					group.active = id;
					group.collapsed = false;
					this.render();
					return;
				}
			}
			if (location.type == 'icon' && this.flyout != id) {
				this.flyout = id;
				this.render();
				return;
			}
			this.remove_from_layout(id);
		}
		else {
			//reopen where Photoshop's default workspace keeps it
			var target = null;
			for (var i = 0; i < DEFAULT_LAYOUT.groups.length && !target; i++) {
				if (DEFAULT_LAYOUT.groups[i].panels.indexOf(id) >= 0) {
					var siblings = DEFAULT_LAYOUT.groups[i].panels;
					target = this.layout.groups.find(function (g) {
						return g.panels.some(function (p) { return siblings.indexOf(p) >= 0; });
					});
					if (!target) {
						target = { panels: [], active: id, height: DEFAULT_LAYOUT.groups[i].height, collapsed: false };
						this.layout.groups.splice(Math.min(i, this.layout.groups.length), 0, target);
					}
				}
			}
			if (target) {
				target.panels.push(id);
				target.active = id;
				target.collapsed = false;
			}
			else {
				this.layout.icons.push(id);
				this.flyout = id;
			}
			this.layout.hidden_all = false;
			this.layout.hidden_dock = false;
		}
		this.render();
		this.apply_visibility();
		this.notify_resize();
	}

	// ----------------- events -----------------

	set_events() {
		var _this = this;

		document.addEventListener('mousedown', function (e) {
			var tab = e.target.closest('.ws_tab');
			if (tab && e.button == 0 && !e.target.closest('.ws_flyout')) {
				e.preventDefault();
				_this.start_tab_drag(e, tab);
				return;
			}
			var tabs = e.target.closest('.ws_float .ws_tabs');
			if (tabs && e.button == 0 && !e.target.closest('.ws_close')) {
				e.preventDefault();
				_this.start_float_move(e, tabs.parentNode);
				return;
			}
			//empty part of a docked tab bar: drag the whole group out (Photoshop)
			var dock_tabs = e.target.closest('.ws_column .ws_tabs');
			if (dock_tabs && e.button == 0) {
				e.preventDefault();
				_this.start_group_drag(e, dock_tabs.closest('.ws_column').dataset.side, parseInt(dock_tabs.parentNode.dataset.index));
				return;
			}
			var grip = e.target.closest('.ws_grip');
			if (grip && e.button == 0) {
				e.preventDefault();
				_this.start_bar_drag(e, grip.dataset.bar);
				return;
			}
			if (e.target.classList.contains('ws_resize_w')) {
				e.preventDefault();
				_this.start_width_drag(e, e.target.dataset.side);
				return;
			}
			if (e.target.classList.contains('ws_split')) {
				e.preventDefault();
				_this.start_split_drag(e, parseInt(e.target.dataset.index), e.target.dataset.side);
				return;
			}
			//click outside closes icon flyout
			if (_this.flyout && !e.target.closest('.ws_flyout') && !e.target.closest('.ws_icon')
				&& !e.target.closest('.adj_dialog') && !e.target.closest('#popups')) {
				_this.flyout = null;
				_this.render();
			}
		});

		this.sidebar.addEventListener('click', function (e) {
			var icon = e.target.closest('.ws_icon');
			if (icon) {
				_this.flyout = _this.flyout == icon.dataset.panel ? null : icon.dataset.panel;
				_this.render();
			}
		});

		document.addEventListener('click', function (e) {
			var close = e.target.closest('.ws_float .ws_close');
			if (close) {
				var group = close.closest('.ws_float');
				_this.layout.floating.splice(parseInt(group.dataset.index), 1);
				_this.render();
			}
		});

		//double click on the tools grip: one or two columns (Photoshop double arrow)
		document.addEventListener('dblclick', function (e) {
			if (!e.target.closest('.ws_tools_grip')) return;
			_this.layout.tools.cols = _this.layout.tools.cols == 2 ? 1 : 2;
			_this.save();
			_this.apply_bars();
			_this.notify_resize();
		});

		//double click tab bar = collapse / expand group (Photoshop)
		document.addEventListener('dblclick', function (e) {
			var tabs = e.target.closest('.ws_column .ws_tabs');
			if (!tabs) return;
			var group = _this.groups_of(tabs.closest('.ws_column').dataset.side)[parseInt(tabs.parentNode.dataset.index)];
			if (!group) return;
			group.collapsed = !group.collapsed;
			_this.render();
		});

		//remember floating panel size after resize handle drag
		document.addEventListener('mouseup', function () {
			var changed = false;
			document.querySelectorAll('.ws_float').forEach(function (node) {
				var f = _this.layout.floating[parseInt(node.dataset.index)];
				if (f && (f.w != node.offsetWidth || f.h != node.offsetHeight)) {
					f.w = node.offsetWidth;
					f.h = node.offsetHeight;
					changed = true;
				}
			});
			if (changed) _this.save();
		});

		//F6 color, F7 layers, F8 info, Tab hide panels, Shift+Tab hide right panels
		document.addEventListener('keydown', function (e) {
			var target = e.target;
			if (target && (target.tagName == 'INPUT' || target.tagName == 'TEXTAREA' || target.tagName == 'SELECT' || target.isContentEditable)) return;
			if (document.querySelector('.adj_dialog') || document.querySelector('#popups .popup') || document.querySelector('.lq_root')) return;
			if ((e.ctrlKey || e.metaKey) && (e.key == 'w' || e.key == 'W') && !e.shiftKey) {
				e.preventDefault();
				e.stopImmediatePropagation();
				close_document();
				return;
			}
			if (e.ctrlKey && e.key == 'Tab') {
				e.preventDefault();
				e.stopImmediatePropagation();
				next_document(e.shiftKey ? -1 : 1);
				return;
			}
			var keys = { F6: 'color', F7: 'layers', F8: 'info' };
			if (keys[e.key] && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				e.stopImmediatePropagation();
				_this.toggle_panel(keys[e.key]);
				return;
			}
			if (e.key == 'Tab' && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (e.shiftKey) {
					_this.layout.hidden_all = false;
					_this.layout.hidden_dock = !_this.layout.hidden_dock;
				}
				else {
					_this.layout.hidden_all = !_this.layout.hidden_all;
				}
				_this.save();
				_this.apply_visibility();
				_this.notify_resize();
			}
		}, true);

		window.addEventListener('resize', function () {
			if (_this.flyout) _this.render();
			//tools bar may need two columns when the window gets short
			_this.apply_bars();
		});
	}

	start_tab_drag(e, tab) {
		var _this = this;
		var id = tab.dataset.panel;
		var start_x = e.clientX, start_y = e.clientY;
		var ghost = null;
		var marker = null;
		var target_of = function (ev) {
			if (ghost) ghost.style.display = 'none';
			var under = document.elementFromPoint(ev.clientX, ev.clientY);
			if (ghost) ghost.style.display = '';
			if (!under) return { type: 'float' };
			var tabs = under.closest('.ws_tabs');
			if (tabs && !tabs.closest('.ws_flyout')) {
				var group = tabs.parentNode;
				//insert before the first tab whose middle is right of the pointer
				var insert = 0;
				tabs.querySelectorAll('.ws_tab').forEach(function (t, i) {
					var r = t.getBoundingClientRect();
					if (ev.clientX > r.left + r.width / 2) insert = i + 1;
				});
				var where = group.dataset.where;
				return { type: where == 'float' ? 'float_group' : 'group', side: where == 'dockL' ? 'left' : 'right', index: parseInt(group.dataset.index), insert: insert, node: tabs };
			}
			if (under.closest('.ws_iconbar')) return { type: 'icon', node: under.closest('.ws_iconbar') };
			if (under.classList.contains('ws_split')) return { type: 'new_group', side: under.dataset.side, index: parseInt(under.dataset.index) + 1, node: under };
			var column = under.closest('.ws_column');
			if (column) return { type: 'new_group', side: column.dataset.side, index: _this.groups_of(column.dataset.side).length, node: column };
			if (under.closest('.ws_dock_left')) return { type: 'new_group', side: 'left', index: _this.layout.left.groups.length, node: _this.left_dock };
			//near the left edge (next to the tools bar): dock on the left
			if (ev.clientX <= _this.left_dock.getBoundingClientRect().right + 60) return { type: 'new_group', side: 'left', index: _this.layout.left.groups.length, node: _this.left_dock };
			if (under.closest('.sidebar_right') && !_this.layout.icons.length) return { type: 'icon', node: _this.sidebar };
			return { type: 'float' };
		};
		var move = function (ev) {
			if (!ghost) {
				if (Math.abs(ev.clientX - start_x) + Math.abs(ev.clientY - start_y) < 6) return;
				ghost = el('div', 'ws_ghost', PANELS[id][0]);
				document.body.appendChild(ghost);
				document.body.classList.add('ws-dragging');
			}
			ghost.style.left = (ev.clientX + 10) + 'px';
			ghost.style.top = (ev.clientY + 8) + 'px';
			var target = target_of(ev);
			if (marker) marker.classList.remove('ws_drop');
			marker = target.node || null;
			if (marker) marker.classList.add('ws_drop');
		};
		var up = function (ev) {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			if (marker) marker.classList.remove('ws_drop');
			document.body.classList.remove('ws-dragging');
			if (!ghost) {
				_this.activate_tab(tab);
				return;
			}
			ghost.remove();
			_this.drop_panel(id, target_of(ev), ev);
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	activate_tab(tab) {
		var group_node = tab.closest('.ws_group');
		if (!group_node) return;
		if (group_node.dataset.where == 'float') {
			var f = this.layout.floating[parseInt(group_node.dataset.index)];
			if (!f) return;
			f.active = tab.dataset.panel;
			this.render();
			config.need_render = true;
			return;
		}
		if (group_node.dataset.where != 'dock' && group_node.dataset.where != 'dockL') return;
		var group = this.groups_of(group_node.dataset.where == 'dockL' ? 'left' : 'right')[parseInt(group_node.dataset.index)];
		group.active = tab.dataset.panel;
		group.collapsed = false;
		this.render();
		config.need_render = true;
	}

	drop_panel(id, target, ev) {
		var layout = this.layout;
		var source = this.location_of(id);
		//keep references to target group objects before removing the panel
		var target_groups = target.side ? this.groups_of(target.side) : null;
		var target_group = target.type == 'group' ? target_groups[target.index] : null;
		var float_target = target.type == 'float_group' ? layout.floating[target.index] : null;
		var into = target_group || float_target;
		if (into && into.panels.length == 1 && into.panels[0] == id) {
			//own single tab dropped on itself
			return;
		}
		var insert = target.insert == null ? (into ? into.panels.length : 0) : target.insert;
		var old_index = into ? into.panels.indexOf(id) : -1;
		if (old_index >= 0 && old_index < insert) insert--;
		var float_size = source && source.type == 'float' ? layout.floating[source.index] : null;
		this.remove_from_layout(id);

		if (target_group) {
			var groups = this.groups_of(target.side);
			if (groups.indexOf(target_group) < 0) groups.push(target_group);
			target_group.panels.splice(Math.min(insert, target_group.panels.length), 0, id);
			target_group.active = id;
			target_group.collapsed = false;
		}
		else if (float_target) {
			if (layout.floating.indexOf(float_target) < 0) layout.floating.push(float_target);
			float_target.panels.splice(Math.min(insert, float_target.panels.length), 0, id);
			float_target.active = id;
		}
		else if (target.type == 'icon') {
			layout.icons.push(id);
		}
		else if (target.type == 'new_group') {
			var list = this.groups_of(target.side);
			list.splice(Math.min(target.index, list.length), 0, { panels: [id], active: id, height: 200, collapsed: false });
		}
		else {
			layout.floating.push({
				panels: [id],
				active: id,
				x: ev.clientX - 40,
				y: ev.clientY - 12,
				w: float_size ? float_size.w : 270,
				h: float_size ? float_size.h : 320,
			});
		}
		this.render();
		this.notify_resize();
	}

	start_float_move(e, node) {
		var _this = this;
		var f = this.layout.floating[parseInt(node.dataset.index)];
		var dx = e.clientX - node.offsetLeft, dy = e.clientY - node.offsetTop;
		document.body.classList.add('ws-dragging');
		var move = function (ev) {
			node.style.left = (ev.clientX - dx) + 'px';
			node.style.top = Math.max(30, ev.clientY - dy) + 'px';
		};
		var up = function (ev) {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			document.body.classList.remove('ws-dragging');
			f.x = node.offsetLeft;
			f.y = node.offsetTop;
			//released over the panel dock: the window docks there as a group
			var dock = _this.sidebar.getBoundingClientRect();
			var left = _this.left_dock.getBoundingClientRect();
			var over_right = ev && dock.width > 0 && ev.clientX >= dock.left && ev.clientY >= dock.top;
			var over_left = ev && (ev.clientX <= Math.max(left.right, 70));
			if (over_right || over_left) {
				_this.layout.floating.splice(_this.layout.floating.indexOf(f), 1);
				_this.groups_of(over_right ? 'right' : 'left').push({ panels: f.panels, active: f.active, height: 220, collapsed: false });
				_this.render();
				_this.notify_resize();
				return;
			}
			_this.save();
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	/**
	 * drag a docked group out by its tab bar: it becomes a floating window
	 */
	start_group_drag(e, side, index) {
		var _this = this;
		var groups = this.groups_of(side);
		var group = groups[index];
		if (!group) return;
		var start_x = e.clientX, start_y = e.clientY;
		var move = function (ev) {
			if (Math.abs(ev.clientX - start_x) + Math.abs(ev.clientY - start_y) < 8) return;
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			groups.splice(groups.indexOf(group), 1);
			var f = { panels: group.panels, active: group.active, x: ev.clientX - 60, y: ev.clientY - 12, w: side == 'left' ? _this.layout.left.width : _this.layout.width, h: Math.max(220, group.height || 300) };
			_this.layout.floating.push(f);
			_this.render();
			_this.notify_resize();
			var node = document.querySelectorAll('.ws_float')[_this.layout.floating.length - 1];
			if (node) _this.start_float_move(ev, node);
		};
		var up = function () {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	// ----------------- tools bar / options bar -----------------

	create_bar_grips() {
		var submenu = document.querySelector('.submenu');
		if (submenu && !submenu.querySelector('.ws_opts_grip')) {
			var grip = el('div', 'ws_grip ws_opts_grip');
			grip.dataset.bar = 'options';
			grip.title = '끌어서 옵션 막대 옮기기 (위 / 아래 / 떠 있기)';
			submenu.insertBefore(grip, submenu.firstChild);
		}
	}

	apply_bars() {
		var wrapper = document.querySelector('.wrapper');
		if (!wrapper) return;
		var tools = this.layout.tools, options = this.layout.options;
		['ws-tools-right', 'ws-tools-float', 'ws-opts-bottom', 'ws-opts-float'].forEach(function (c) { wrapper.classList.remove(c); });
		if (tools.pos == 'right') wrapper.classList.add('ws-tools-right');
		if (tools.pos == 'float') wrapper.classList.add('ws-tools-float');
		if (options.pos == 'bottom') wrapper.classList.add('ws-opts-bottom');
		if (options.pos == 'float') wrapper.classList.add('ws-opts-float');
		var bar = document.getElementById('tools_container');
		if (bar) {
			bar.classList.toggle('ws-2col', tools.cols == 2);
			//short window: two columns like Photoshop instead of cut off tools
			bar.classList.remove('ws-2col-auto');
			if (tools.cols != 2 && bar.scrollHeight > bar.clientHeight + 4) bar.classList.add('ws-2col', 'ws-2col-auto');
			bar.style.left = tools.pos == 'float' ? Math.max(0, Math.min(window.innerWidth - 60, tools.x)) + 'px' : '';
			//keep the whole floating bar on screen
			var bar_h = Math.min(bar.scrollHeight || 400, window.innerHeight - 60);
			bar.style.top = tools.pos == 'float' ? Math.max(30, Math.min(window.innerHeight - bar_h - 10, tools.y)) + 'px' : '';
		}
		var submenu = document.querySelector('.submenu');
		if (submenu) {
			submenu.style.left = options.pos == 'float' ? Math.max(0, Math.min(window.innerWidth - 200, options.x)) + 'px' : '';
			submenu.style.top = options.pos == 'float' ? Math.max(30, Math.min(window.innerHeight - 50, options.y)) + 'px' : '';
		}
	}

	/**
	 * drag the tools bar (left / right / floating) or the options bar (top / bottom / floating)
	 */
	start_bar_drag(e, kind) {
		var _this = this;
		var node = kind == 'tools' ? document.getElementById('tools_container') : document.querySelector('.submenu');
		if (!node) return;
		var state = kind == 'tools' ? this.layout.tools : this.layout.options;
		var rect = node.getBoundingClientRect();
		var dx = e.clientX - rect.left, dy = e.clientY - rect.top;
		var moved = false;
		var move = function (ev) {
			if (!moved && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 6) return;
			moved = true;
			//follows the mouse as a floating bar while dragging
			state.pos = 'float';
			state.x = ev.clientX - dx;
			state.y = ev.clientY - dy;
			_this.apply_bars();
		};
		var up = function (ev) {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			if (!moved) return;
			var top = document.querySelector('.wrapper').getBoundingClientRect().top;
			if (kind == 'tools') {
				var dock = _this.sidebar.getBoundingClientRect();
				if (ev.clientX < 90) state.pos = 'left';
				else if (ev.clientX > Math.min(dock.left, window.innerWidth - 90) - 40) state.pos = 'right';
			}
			else {
				if (ev.clientY < top + 60) state.pos = 'top';
				else if (ev.clientY > window.innerHeight - 70) state.pos = 'bottom';
			}
			_this.save();
			_this.apply_bars();
			_this.notify_resize();
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	start_width_drag(e, side) {
		var _this = this;
		var left = side == 'left';
		var holder = left ? this.layout.left : this.layout;
		var start = e.clientX, width = holder.width;
		var column = (left ? this.left_dock : this.sidebar).querySelector('.ws_column');
		var move = function (ev) {
			holder.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width + (left ? ev.clientX - start : start - ev.clientX)));
			column.style.width = holder.width + 'px';
		};
		var up = function () {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			_this.save();
			_this.notify_resize();
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	start_split_drag(e, index, side) {
		var _this = this;
		var group = this.groups_of(side)[index];
		var node = (side == 'left' ? this.left_dock : this.sidebar).querySelectorAll('.ws_column > .ws_group')[index];
		if (!group || !node) return;
		var start = e.clientY, height = node.offsetHeight;
		group.collapsed = false;
		node.classList.remove('collapsed', 'fill');
		var move = function (ev) {
			group.height = Math.max(60, Math.min(window.innerHeight - 200, height + ev.clientY - start));
			node.style.height = group.height + 'px';
		};
		var up = function () {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			_this.save();
			config.need_render = true;
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}
}

export default Ps_workspace_class;
