/*
 * Tools panel laid out like Photoshop: tool groups in Photoshop order,
 * flyout with the other tools of a group (right click or long press),
 * shortcut key = group, Shift + key = next tool in group,
 * foreground / background color swatches at the bottom.
 * Icons are drawn for this app (not Adobe artwork).
 */
import app from './../../app.js';
import config from './../../config.js';

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
	select: `<svg viewBox="0 0 24 24"><path ${S} d="M5 3l11 9-5 1 3 6-2 1-3-6-4 4z"/><path ${S} d="M18 14v6M15 17h6"/></svg>`,
	selection: `<svg viewBox="0 0 24 24"><rect ${S} x="4" y="5" width="16" height="14" stroke-dasharray="3 2.4"/></svg>`,
	marquee_rect: `<svg viewBox="0 0 24 24"><rect ${S} x="4" y="5" width="16" height="14" stroke-dasharray="3 2.4"/></svg>`,
	marquee_ellipse: `<svg viewBox="0 0 24 24"><ellipse ${S} cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="3 2.4"/></svg>`,
	lasso: `<svg viewBox="0 0 24 24"><path ${S} d="M12 4c5 0 8.5 2.5 8.5 6s-4 6-8.5 6c-2 0-3.5-.4-4.6-1M5 14c-1.2-1-1.5-2.4-1.5-4C3.5 6.5 7 4 12 4"/><path ${S} d="M7.4 15c-1.6.8-1.4 3 .4 3.3 1.5.2 1.6 1.6.7 2.7"/></svg>`,
	polygon_lasso: `<svg viewBox="0 0 24 24"><path ${S} d="M4 9l7-5 9 4-3 8-7 1z"/><path ${S} d="M10 17l-1 4"/></svg>`,
	magic_wand: `<svg viewBox="0 0 24 24"><path ${S} d="M4 20L15 9M13 7l4 4"/><path ${S} d="M17 2v3M15.5 3.5h3M20 6v2M19 7h2M10 3v2M9 4h2"/></svg>`,
	object_select: `<svg viewBox="0 0 24 24"><rect ${S} x="3" y="3" width="18" height="18" stroke-dasharray="3 2.4"/><path ${S} d="M9 15c0-3 2-6 4-6s3 2 2 4-1 3-3 3-3 0-3-1z"/><path ${S} d="M15 15l4 4"/></svg>`,
	spot_heal: `<svg viewBox="0 0 24 24"><rect ${S} x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path ${S} d="M10 10l4 4M12 9.5v.01M9.5 12v.01M14.5 12v.01M12 14.5v.01"/></svg>`,
	healing: `<svg viewBox="0 0 24 24"><rect ${S} x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path ${S} d="M10 12h4M12 10v4"/></svg>`,
	patch: `<svg viewBox="0 0 24 24"><path ${S} d="M5 7c3-3 9-3 12 0s3 8 0 10-9 3-12 0-3-7 0-10z" stroke-dasharray="3 2"/><path ${S} d="M9 12h6M12 9v6"/></svg>`,
	red_eye: `<svg viewBox="0 0 24 24"><path ${S} d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="#e33"/></svg>`,
	quick_select: `<svg viewBox="0 0 24 24"><circle ${S} cx="9" cy="9" r="5" stroke-dasharray="2.5 2"/><path ${S} d="M13 13l7 7M17 15l-2 2"/></svg>`,
	magnetic_lasso: `<svg viewBox="0 0 24 24"><path ${S} d="M12 4c5 0 8.5 2.5 8.5 6s-4 6-8.5 6c-2 0-3.5-.4-4.6-1"/><path ${S} d="M5 13v5a2 2 0 0 0 4 0v-5M5 15h4"/></svg>`,
	perspective_crop: `<svg viewBox="0 0 24 24"><path ${S} d="M7 3v14h14M3 7h14v14"/><path ${S} d="M7 7l4 10"/></svg>`,
	direct_select: `<svg viewBox="0 0 24 24"><path d="M6 3l12 9-5.5 1 3.5 7-2 1-3.5-7L6 18z" fill="#fff" stroke="currentColor" stroke-width="1.3"/></svg>`,
	pen: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l5 9-5 9-5-9z"/><circle cx="12" cy="12" r="1.6"/><path ${S} d="M12 3v7"/></svg>`,
	dodge: `<svg viewBox="0 0 24 24"><circle ${S} cx="9" cy="9" r="5"/><path ${S} d="M12.5 12.5L20 20"/></svg>`,
	burn: `<svg viewBox="0 0 24 24"><path ${S} d="M7 14c-1-3 0-6 2-6 1 0 1 2 1 3 1-2 3-3 4-2s0 3-1 4c2-1 4-1 4 1s-3 4-6 4-4-2-4-4z"/></svg>`,
	sponge: `<svg viewBox="0 0 24 24"><path ${S} d="M5 8c0-2 2-3 4-2 1-2 5-2 6 0 2-1 4 0 4 2v8c0 2-2 3-4 2-1 2-5 2-6 0-2 1-4 0-4-2z"/><circle cx="10" cy="11" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg>`,
	smudge: `<svg viewBox="0 0 24 24"><path ${S} d="M8 21l-2-6V6a1.5 1.5 0 0 1 3 0v6V3.5a1.5 1.5 0 0 1 3 0V11"/><path ${S} d="M12 11V5.5a1.5 1.5 0 0 1 3 0V12M15 12V8a1.5 1.5 0 0 1 3 0v6c0 3-1 5-3 7"/></svg>`,
	crop: `<svg viewBox="0 0 24 24"><path ${S} d="M7 2v15h15M2 7h15v15"/></svg>`,
	pick_color: `<svg viewBox="0 0 24 24"><path ${S} d="M14 4l6 6M17 7l-9.5 9.5-3.5 1 1-3.5L14.5 4.5"/><path ${S} d="M15 3.5a2.1 2.1 0 0 1 3 0l2.5 2.5a2.1 2.1 0 0 1 0 3"/></svg>`,
	brush: `<svg viewBox="0 0 24 24"><path ${S} d="M20 3l-9 10"/><path ${S} d="M10.5 13.5c-2.5-1-5 .5-5 3.5 0 1.8-1 3-2.5 3.5 4 1 8.5 0 8.5-4.5"/></svg>`,
	pencil: `<svg viewBox="0 0 24 24"><path ${S} d="M16.5 3.5l4 4L8 20l-5 1 1-5z"/><path ${S} d="M14 6l4 4"/></svg>`,
	clone: `<svg viewBox="0 0 24 24"><path ${S} d="M9 3h6l-1 7h-4zM6 13h12v3H6zM5 19h14"/></svg>`,
	erase: `<svg viewBox="0 0 24 24"><path ${S} d="M8 20h12M4 15l9-9 6 6-7 7H8z"/><path ${S} d="M9 10l6 6"/></svg>`,
	magic_erase: `<svg viewBox="0 0 24 24"><path ${S} d="M4 16l7-7 5 5-5 5H7z"/><path ${S} d="M17 3v4M15 5h4M20 9v2M19 10h2"/></svg>`,
	gradient: `<svg viewBox="0 0 24 24"><defs><linearGradient id="tbg" x1="0" x2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><rect x="3.5" y="6" width="17" height="12" rx="1" fill="url(#tbg)" stroke="currentColor" stroke-width="1.4"/></svg>`,
	fill: `<svg viewBox="0 0 24 24"><path ${S} d="M5 11l7-7 7 7-7 7z"/><path ${S} d="M5 11h14"/><path fill="currentColor" d="M20 15s2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 2-3.6 2-3.6z"/></svg>`,
	blur: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>`,
	sharpen: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l7 17H5z"/></svg>`,
	desaturate: `<svg viewBox="0 0 24 24"><path ${S} d="M5 8c0-2 2-3 4-2 1-2 5-2 6 0 2-1 4 0 4 2v8c0 2-2 3-4 2-1 2-5 2-6 0-2 1-4 0-4-2z"/><circle cx="10" cy="11" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg>`,
	bezier_curve: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l5 9-5 9-5-9z"/><path ${S} d="M12 3v8"/><circle cx="12" cy="12.5" r="1.4" fill="currentColor"/></svg>`,
	text: `<svg viewBox="0 0 24 24"><path ${S} d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>`,
	rectangle: `<svg viewBox="0 0 24 24"><rect ${S} x="4" y="6" width="16" height="12" rx="1"/></svg>`,
	ellipse: `<svg viewBox="0 0 24 24"><ellipse ${S} cx="12" cy="12" rx="8" ry="6.5"/></svg>`,
	triangle: `<svg viewBox="0 0 24 24"><path ${S} d="M12 4l9 16H3z"/></svg>`,
	polygon: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l8 6-3 10H7L4 9z"/></svg>`,
	regular_polygon: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l8 6-3 10H7L4 9z"/></svg>`,
	line: `<svg viewBox="0 0 24 24"><path ${S} d="M4 20L20 4"/></svg>`,
	shape: `<svg viewBox="0 0 24 24"><path ${S} d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>`,
	hand: `<svg viewBox="0 0 24 24"><path ${S} d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V12M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.5 15a1.6 1.6 0 0 1 2.4-2l1.1 1.3"/></svg>`,
	rotate_view: `<svg viewBox="0 0 24 24"><path ${S} d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5.5a1.5 1.5 0 0 1 3 0V11M14 11V7a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-6.5 6.5h-.5a5.5 5.5 0 0 1-4.4-2.2L4 15.6a1.5 1.5 0 0 1 2.3-1.9L8 15.5"/><path ${S} d="M17.5 2.5a5 5 0 0 1 3.5 4.5M21 7l-1.6-.8M21 7l.5-1.7"/></svg>`,
	zoom: `<svg viewBox="0 0 24 24"><circle ${S} cx="10" cy="10" r="6"/><path ${S} d="M14.5 14.5L20 20M10 7v6M7 10h6"/></svg>`,
};

// [shortcut, tools] - Photoshop order, Korean Photoshop names
export const TOOL_GROUPS = [
	{ key: 'v', tools: [['select', '이동 도구']] },
	{ key: 'm', tools: [['marquee_rect', '사각형 선택 윤곽 도구'], ['marquee_ellipse', '원형 선택 윤곽 도구']] },
	{ key: 'l', tools: [['lasso', '올가미 도구'], ['polygon_lasso', '다각형 올가미 도구'], ['magnetic_lasso', '자석 올가미 도구']] },
	{ key: 'w', tools: [['object_select', '오브젝트 선택 도구'], ['quick_select', '빠른 선택 도구'], ['magic_wand', '자동 선택 도구']] },
	{ key: 'c', tools: [['crop', '자르기 도구'], ['perspective_crop', '원근 자르기 도구']] },
	{ key: 'i', tools: [['pick_color', '스포이드 도구']] },
	{ key: 'j', tools: [['spot_heal', '스팟 복구 브러시 도구'], ['healing', '복구 브러시 도구'], ['patch', '패치 도구'], ['red_eye', '적목 현상 도구']] },
	{ key: 'b', tools: [['brush', '브러시 도구'], ['pencil', '연필 도구']] },
	{ key: 's', tools: [['clone', '복제 도장 도구']] },
	{ key: 'e', tools: [['erase', '지우개 도구'], ['magic_erase', '자동 지우개 도구']] },
	{ key: 'g', tools: [['gradient', '그레이디언트 도구'], ['fill', '페인트 통 도구']] },
	{ key: null, tools: [['blur', '흐림 효과 도구'], ['sharpen', '선명 효과 도구'], ['smudge', '손가락 도구']] },
	{ key: 'o', tools: [['dodge', '닷지 도구'], ['burn', '번 도구'], ['sponge', '스펀지 도구']] },
	{ key: 'p', tools: [['pen', '펜 도구'], ['bezier_curve', '곡률 펜 도구']] },
	{ key: 't', tools: [['text', '수평 문자 도구']] },
	{ key: 'a', tools: [['direct_select', '직접 선택 도구']] },
	{ key: 'u', tools: [['rectangle', '사각형 도구'], ['ellipse', '타원 도구'], ['triangle', '삼각형 도구'],
		['regular_polygon', '다각형 도구'], ['star', '별 모양 도구'], ['line', '선 도구'], ['shape', '사용자 지정 모양 도구']] },
	{ key: 'h', tools: [['hand', '손 도구'], ['rotate_view', '회전 보기 도구', 'r']] },
	{ key: 'z', tools: [['zoom', '돋보기 도구']] },
];

// tools kept working but not shown in panel (menu or other entry points)
const HIDDEN_TOOLS = ['media', 'animation', 'bulge_pinch', 'selection', 'desaturate', 'transform'];

export class Ps_toolbar_class {

	constructor() {
		this.current = {}; //group index -> tool name
		this.flyout = null;
	}

	tool_title(name) {
		for (const group of TOOL_GROUPS) {
			for (const t of group.tools) {
				if (t[0] == name) return t[1];
			}
		}
		return name;
	}

	group_of(name) {
		return TOOL_GROUPS.findIndex(function (g) { return g.tools.some(function (t) { return t[0] == name; }); });
	}

	render(container, active_tool) {
		var _this = this;
		container.innerHTML = '';
		container.classList.add('ps_toolbar');
		//grip: drag the bar anywhere (left, right, floating), double click = 1 / 2 columns
		var grip = document.createElement('div');
		grip.className = 'ws_grip ws_tools_grip';
		grip.dataset.bar = 'tools';
		grip.title = '끌어서 도구 막대 옮기기 (왼쪽 / 오른쪽 / 떠 있기) · 더블클릭: 1열 / 2열';
		container.appendChild(grip);
		var all = config.TOOLS.map(function (t) { return t.name; });

		TOOL_GROUPS.forEach(function (group, index) {
			var tools = group.tools.filter(function (t) { return all.includes(t[0]); });
			if (tools.length == 0) return;
			var wrap = document.createElement('div');
			wrap.className = 'ps_group' + (tools.length > 1 ? ' has_more' : '');
			wrap.dataset.group = index;
			tools.forEach(function (t) {
				var el = document.createElement('span');
				el.id = t[0];
				el.className = 'ps_tool ' + t[0] + (t[0] == active_tool ? ' active' : '');
				el.innerHTML = ICONS[t[0]] || ICONS.shape;
				var tool_key = t[2] || group.key;
				el.title = t[1] + (tool_key ? ' (' + tool_key.toUpperCase() + ')' : '');
				el.addEventListener('click', function () {
					_this.choose(this.id);
				});
				wrap.appendChild(el);
			});
			var current = tools.some(function (t) { return t[0] == active_tool; }) ? active_tool : tools[0][0];
			_this.current[index] = current;
			_this.show_current(wrap, current);

			//flyout: right click or long press
			wrap.addEventListener('contextmenu', function (e) {
				e.preventDefault();
				_this.open_flyout(index, wrap);
			});
			var timer = null;
			wrap.addEventListener('mousedown', function (e) {
				if (e.button != 0 || tools.length < 2) return;
				timer = setTimeout(function () { _this.open_flyout(index, wrap); }, 450);
			});
			wrap.addEventListener('mouseup', function () { clearTimeout(timer); });
			wrap.addEventListener('mouseleave', function () { clearTimeout(timer); });
			container.appendChild(wrap);
		});

		//every other tool exists as hidden element so activation by id keeps working
		config.TOOLS.forEach(function (t) {
			if (document.getElementById(t.name)) return;
			var el = document.createElement('span');
			el.id = t.name;
			el.className = 'ps_tool ' + t.name + (t.name == active_tool ? ' active' : '');
			el.style.display = 'none';
			el.addEventListener('click', function () { _this.choose(this.id); });
			container.appendChild(el);
		});

		this.render_swatches(container);
		document.addEventListener('mousedown', function (e) {
			if (_this.flyout && !_this.flyout.contains(e.target)) _this.close_flyout();
		});
	}

	show_current(wrap, name) {
		wrap.querySelectorAll('.ps_tool').forEach(function (el) {
			el.classList.toggle('shown', el.id == name);
		});
	}

	/**
	 * activates tool and makes it the visible one of its group
	 */
	choose(name) {
		var index = this.group_of(name);
		if (index >= 0) {
			this.current[index] = name;
			var wrap = document.querySelector('.ps_group[data-group="' + index + '"]');
			if (wrap) this.show_current(wrap, name);
		}
		this.close_flyout();
		app.GUI.GUI_tools.activate_tool(name);
	}

	/**
	 * shortcut key: group's current tool, with Shift: next tool of the group
	 */
	select_by_key(key, cycle) {
		//a tool with its own key inside a group (Rotate View = R in the Hand group)
		for (const g of TOOL_GROUPS) {
			const own = g.tools.find(function (t) { return t[2] == key; });
			if (own && document.getElementById(own[0])) {
				this.choose(own[0]);
				return true;
			}
		}
		var index = TOOL_GROUPS.findIndex(function (g) { return g.key == key; });
		if (index < 0) return false;
		var all = config.TOOLS.map(function (t) { return t.name; });
		var tools = TOOL_GROUPS[index].tools.filter(function (t) { return !t[2]; }).map(function (t) { return t[0]; }).filter(function (n) { return all.includes(n); });
		var current = tools.includes(this.current[index]) ? this.current[index] : tools[0];
		var name = cycle ? tools[(tools.indexOf(current) + 1) % tools.length] : current;
		this.choose(name);
		return true;
	}

	open_flyout(index, wrap) {
		var _this = this;
		this.close_flyout();
		var group = TOOL_GROUPS[index];
		var menu = document.createElement('div');
		menu.className = 'ps_flyout';
		group.tools.forEach(function (t) {
			if (!document.getElementById(t[0])) return;
			var item = document.createElement('div');
			item.className = 'ps_flyout_item' + (_this.current[index] == t[0] ? ' current' : '');
			item.innerHTML = '<span class="ps_flyout_icon">' + (ICONS[t[0]] || ICONS.shape) + '</span>'
				+ '<span class="ps_flyout_name">' + t[1] + '</span>'
				+ '<span class="ps_flyout_key">' + ((t[2] || group.key) ? (t[2] || group.key).toUpperCase() : '') + '</span>';
			item.addEventListener('mousedown', function (e) { e.stopPropagation(); });
			item.addEventListener('click', function () { _this.choose(t[0]); });
			menu.appendChild(item);
		});
		var rect = wrap.getBoundingClientRect();
		menu.style.left = (rect.right + 4) + 'px';
		menu.style.top = rect.top + 'px';
		document.body.appendChild(menu);
		this.flyout = menu;
	}

	close_flyout() {
		if (this.flyout) {
			this.flyout.remove();
			this.flyout = null;
		}
	}

	render_swatches(container) {
		var _this = this;
		var box = document.createElement('div');
		box.className = 'ps_swatches';
		box.innerHTML = '<button type="button" class="ps_bg" title="배경색 (클릭: 전경색과 바꾸기)"></button>'
			+ '<button type="button" class="ps_fg" title="전경색 (색상 패널에서 변경)"></button>'
			+ '<button type="button" class="ps_default" title="기본 전경색과 배경색 (D)"><span></span><span></span></button>'
			+ '<button type="button" class="ps_swap" title="전경색과 배경색 바꾸기 (X)">⇄</button>';
		container.appendChild(box);
		var swap = function () {
			var current = config.COLOR;
			app.GUI.GUI_colors.set_color({ hex: config.BG_COLOR || '#ffffff' });
			config.BG_COLOR = current;
			_this.render_colors();
		};
		box.querySelector('.ps_swap').addEventListener('click', swap);
		box.querySelector('.ps_bg').addEventListener('click', swap);
		box.querySelector('.ps_default').addEventListener('click', function () {
			config.BG_COLOR = '#ffffff';
			app.GUI.GUI_colors.set_color({ hex: '#000000' });
			_this.render_colors();
		});
		box.querySelector('.ps_fg').addEventListener('click', function () {
			var colors = document.querySelector('.sidebar_right .colors');
			if (colors) colors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
		this.render_colors();
		//follow foreground changes made by color panel / eyedropper
		if (!this.color_timer) {
			this.color_timer = setInterval(function () {
				if (_this.last_fg != config.COLOR || _this.last_bg != config.BG_COLOR) _this.render_colors();
			}, 250);
		}
	}

	render_colors() {
		var fg = document.querySelector('.ps_swatches .ps_fg');
		var bg = document.querySelector('.ps_swatches .ps_bg');
		if (!fg || !bg) return;
		fg.style.background = config.COLOR;
		bg.style.background = config.BG_COLOR || '#ffffff';
		this.last_fg = config.COLOR;
		this.last_bg = config.BG_COLOR;
	}
}

export { HIDDEN_TOOLS };
