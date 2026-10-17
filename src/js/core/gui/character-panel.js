/*
 * Character / Paragraph panel and Warp Text (Photoshop Type features)
 */
import app from './../../app.js';
import config from './../../config.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

function text_tool() {
	return config.TOOLS.find(function (t) { return t.name == 'text'; });
}

function get(attr, key) {
	var v = attr[key];
	return v && typeof v == 'object' && 'value' in v ? v.value : v;
}

function set(target, key, value) {
	if (target[key] && typeof target[key] == 'object' && 'value' in target[key]) target[key] = Object.assign({}, target[key], { value: value });
	else target[key] = value;
}

//character settings are stored per text span (meta), not on the layer
const META_KEYS = { font: 'family', size: 'size', bold: 'bold', italic: 'italic', underline: 'underline', strikethrough: 'strikethrough', fill: 'fill_color', kerning: 'kerning', leading: 'leading' };

function first_meta(layer) {
	var line = layer && layer.data && layer.data[0];
	return line && line[0] ? line[0].meta || {} : {};
}

/**
 * applies to the text tool (next text) and, like Photoshop with a type layer selected, to the whole selected text layer
 */
function apply(key, value) {
	set(text_tool().attributes, key, value);
	var layer = config.layer;
	if (layer && layer.type == 'text' && layer.data && META_KEYS[key]) {
		var data = JSON.parse(JSON.stringify(layer.data));
		data.forEach(function (line) {
			line.forEach(function (span) {
				span.meta = span.meta || {};
				span.meta[META_KEYS[key]] = value;
			});
		});
		var action = new app.Actions.Update_layer_action(layer.id, { data: data });
		action.action_description = '문자 설정';
		app.State.do_action(action);
	}
	if (config.TOOL && config.TOOL.name == 'text') app.GUI.GUI_tools.show_action_attributes();
}

/**
 * paragraph settings live on the layer params (and become the default for the next text)
 */
function apply_paragraph(key, value) {
	config.paragraph_defaults = Object.assign({}, config.paragraph_defaults || {});
	config.paragraph_defaults[key] = value;
	var layer = config.layer;
	if (layer && layer.type == 'text') {
		var params = JSON.parse(JSON.stringify(layer.params || {}));
		params[key] = value;
		//data is resent so the text layout is recalculated
		var action = new app.Actions.Update_layer_action(layer.id, { params: params, data: JSON.parse(JSON.stringify(layer.data || [])) });
		action.action_description = '단락 설정';
		app.State.do_action(action);
	}
}

function paragraph_value(key, fallback) {
	var layer = config.layer && config.layer.type == 'text' ? config.layer : null;
	var params = layer ? layer.params || {} : config.paragraph_defaults || {};
	return params[key] != null ? params[key] : fallback;
}

const ALIGNS = [
	['left', '텍스트 왼쪽 정렬', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6h8M2 9h12M2 12h8"/></svg>'],
	['center', '텍스트 중앙 정렬', '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6h8M2 9h12M4 12h8"/></svg>'],
	['right', '텍스트 오른쪽 정렬', '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6h8M2 9h12M6 12h8"/></svg>'],
	['justify', '마지막 줄 왼쪽 정렬', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6h12M2 9h12M2 12h7"/></svg>'],
	['justify_all', '전체 균등 배치', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6h12M2 9h12M2 12h12"/></svg>'],
];

function align_buttons() {
	var current = paragraph_value('halign', 'left');
	return ALIGNS.map(function (a) {
		return '<button type="button" data-halign="' + a[0] + '" title="' + a[1] + '" class="' + (current == a[0] ? 'on' : '') + '">' + a[2] + '</button>';
	}).join('');
}

/**
 * Window > Paragraph (Photoshop paragraph panel)
 */
export function create_paragraph_panel() {
	var box = document.createElement('div');
	box.className = 'ch_panel pg_panel';
	var field = function (key, label, title) {
		return '<label title="' + title + '">' + label + '</label><input type="number" data-pkey="' + key + '" value="' + paragraph_value(key, 0) + '" step="1">';
	};
	var render = function () {
		var layer = config.layer && config.layer.type == 'text' ? config.layer : null;
		box.innerHTML = '<div class="ch_row ch_toggles pg_aligns">' + align_buttons() + '</div>'
			+ '<div class="ch_row">' + field('indent_left', '→|', '왼쪽 여백 들여쓰기 (px)') + field('indent_right', '|←', '오른쪽 여백 들여쓰기 (px)') + '</div>'
			+ '<div class="ch_row">' + field('indent_first', '⇥', '첫 줄 들여쓰기 (px, 음수는 내어쓰기)') + '</div>'
			+ '<div class="ch_row">' + field('space_before', '↥', '단락 앞에 공백 추가 (px)') + field('space_after', '↧', '단락 뒤에 공백 추가 (px)') + '</div>'
			+ '<div class="adj_hint">' + (layer
				? (layer.params && layer.params.boundary == 'dynamic' ? '포인트 문자입니다. 줄바꿈·균등 배치는 문자 도구로 드래그해 만든 단락 문자(글상자)에서 동작해요.' : '선택한 문자 레이어에 적용됩니다')
				: '다음에 입력할 문자에 적용됩니다') + '</div>';
	};
	box.addEventListener('change', function (e) {
		var key = e.target.dataset.pkey;
		if (!key) return;
		apply_paragraph(key, parseFloat(e.target.value) || 0);
	});
	box.addEventListener('click', function (e) {
		var button = e.target.closest('[data-halign]');
		if (!button) return;
		apply_paragraph('halign', button.dataset.halign);
		setTimeout(render, 50);
	});
	var last = '';
	setInterval(function () {
		var key = config.layer ? config.layer.id + ':' + config.layer.type : '';
		if (key != last && !box.contains(document.activeElement)) {
			last = key;
			render();
		}
	}, 400);
	render();
	return box;
}

export function create_character_panel() {
	var box = document.createElement('div');
	box.className = 'ch_panel';
	var render = function () {
		var attr = text_tool().attributes;
		var layer = null;
		if (config.layer && config.layer.type == 'text') {
			//read the character settings from the text itself
			var meta = first_meta(config.layer);
			layer = {};
			for (var k in META_KEYS) {
				if (meta[META_KEYS[k]] != null) layer[k] = meta[META_KEYS[k]];
			}
		}
		var source = layer ? Object.assign({}, attr, layer) : attr;
		var fonts = (config.FONTS || []).concat(Object.keys(config.user_fonts || {}));
		var font = get(source, 'font') || 'Arial';
		box.innerHTML = '<div class="ch_row"><select class="adj_select" data-key="font">'
			+ fonts.map(function (f) { return '<option' + (f == font ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>'
			+ '<div class="ch_row"><label title="크기">T</label><input type="number" data-key="size" value="' + (get(source, 'size') || 40) + '" min="1">'
			+ '<label title="행간">↕</label><input type="number" data-key="leading" value="' + (get(source, 'leading') || 0) + '"></div>'
			+ '<div class="ch_row"><label title="자간(커닝)">VA</label><input type="number" data-key="kerning" value="' + (get(source, 'kerning') || 0) + '">'
			+ '<label title="색상">색</label><input type="color" data-key="fill" value="' + (get(source, 'fill') || '#000000') + '"></div>'
			+ '<div class="ch_row ch_toggles">'
			+ ['bold', 'italic', 'underline', 'strikethrough'].map(function (k, i) {
				return '<button type="button" data-toggle="' + k + '" class="' + (get(source, k) ? 'on' : '') + '">' + ['<b>B</b>', '<i>I</i>', '<u>U</u>', '<s>S</s>'][i] + '</button>';
			}).join('') + '</div>'
			+ '<div class="ch_row ch_toggles">' + align_buttons()
			+ '<button type="button" data-warp="1" title="텍스트 뒤틀기">⌒</button></div>'
			+ '<div class="adj_hint">' + (layer ? '선택한 문자 레이어에 적용됩니다' : '다음에 입력할 문자에 적용됩니다') + '</div>';
	};
	box.addEventListener('change', function (e) {
		var key = e.target.dataset.key;
		if (!key) return;
		var v = e.target.type == 'number' ? parseFloat(e.target.value) : e.target.value;
		apply(key, v);
	});
	box.addEventListener('click', function (e) {
		var toggle = e.target.closest('[data-toggle]');
		if (toggle) {
			apply(toggle.dataset.toggle, !toggle.classList.contains('on'));
			setTimeout(render, 50);
			return;
		}
		var align = e.target.closest('[data-halign]');
		if (align) {
			apply_paragraph('halign', align.dataset.halign);
			setTimeout(render, 50);
			return;
		}
		if (e.target.closest('[data-warp]')) warp_text();
	});
	var last = '';
	setInterval(function () {
		var key = config.layer ? config.layer.id + ':' + config.layer.type : '';
		if (key != last && !box.contains(document.activeElement)) {
			last = key;
			render();
		}
	}, 400);
	render();
	return box;
}

const WARPS = [['none', '없음'], ['arc', '부채꼴'], ['arch', '아치'], ['bulge', '돌출'], ['flag', '깃발'], ['wave', '물결'], ['rise', '상승']];

/**
 * Type > Warp Text
 */
export function warp_text() {
	var layer = config.layer;
	if (!layer || layer.type != 'text') {
		alertify.error('문자 레이어를 선택하세요.');
		return;
	}
	var original = layer.text_warp;
	var warp = Object.assign({ style: 'arc', bend: 50 }, original || {});
	var dialog = new Adjust_dialog();
	var root = null;
	var live = function () {
		warp.style = root.querySelector('#tw_style').value;
		warp.bend = parseFloat(root.querySelector('#tw_bend').value);
		layer.text_warp = Object.assign({}, warp);
		config.need_render = true;
	};
	dialog.open({
		title: '텍스트 뒤틀기',
		body: '<div class="adj_row"><label>스타일</label><select class="adj_select" id="tw_style">'
			+ WARPS.map(function (w) { return '<option value="' + w[0] + '"' + (w[0] == warp.style ? ' selected' : '') + '>' + w[1] + '</option>'; }).join('')
			+ '</select></div><div class="adj_row"><label>구부리기(%)</label><input type="range" id="tw_bend" min="-100" max="100" value="' + warp.bend + '"></div>',
		on_open: function (el) {
			root = el;
			el.querySelector('#tw_style').addEventListener('change', live);
			el.querySelector('#tw_bend').addEventListener('input', live);
			live();
		},
		on_reset: function () { root.querySelector('#tw_style').value = 'none'; live(); },
		on_preview_toggle: function (on) { layer.text_warp = on ? Object.assign({}, warp) : original; config.need_render = true; },
		on_ok: function () {
			layer.text_warp = original;
			var action = new app.Actions.Update_layer_action(layer.id, { text_warp: warp.style == 'none' ? null : Object.assign({}, warp) });
			action.action_description = '텍스트 뒤틀기';
			app.State.do_action(action);
		},
		on_cancel: function () { layer.text_warp = original; config.need_render = true; },
	});
}

/**
 * draws a rendered text layer (doc sized buffer) column by column with the warp offset
 */
export function draw_warped(ctx, buffer, layer) {
	var w = layer.text_warp, bend = w.bend / 100;
	var x0 = Math.max(0, Math.floor(layer.x)), x1 = Math.min(buffer.width, Math.ceil(layer.x + Math.max(layer.width, 1)));
	var height = Math.max(layer.height, 10), amp = height * 0.6 * bend;
	var cy = layer.y + height / 2;
	for (var x = x0; x < x1; x++) {
		var t = (x - x0) / Math.max(1, x1 - x0), u = t * 2 - 1;
		var dy = 0, sy = 1;
		if (w.style == 'arc') dy = -amp * (1 - u * u);
		else if (w.style == 'arch') { dy = -amp * (1 - u * u); sy = 1 + bend * 0.4 * (1 - u * u); }
		else if (w.style == 'bulge') sy = 1 + bend * 0.6 * (1 - u * u);
		else if (w.style == 'flag') dy = amp * 0.5 * Math.sin(t * Math.PI * 2);
		else if (w.style == 'wave') dy = amp * 0.35 * Math.sin(t * Math.PI * 3);
		else if (w.style == 'rise') dy = -amp * u * 0.6;
		if (sy == 1) {
			ctx.drawImage(buffer, x, 0, 1, buffer.height, x, dy, 1, buffer.height);
		}
		else {
			ctx.drawImage(buffer, x, 0, 1, buffer.height, x, cy - cy * sy + dy, 1, buffer.height * sy);
		}
	}
}
