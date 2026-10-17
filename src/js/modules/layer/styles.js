import app from './../../app.js';
import config from './../../config.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import { STYLE_DEFAULTS, STYLE_NAMES } from './../../libs/layer-styles.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

const ORDER = ['bevel', 'stroke', 'inner_shadow', 'inner_glow', 'color_overlay', 'gradient_overlay', 'outer_glow', 'drop_shadow'];

// field -> [label, type, min, max]
const FIELDS = {
	color: ['색상', 'color'], color1: ['시작 색', 'color'], color2: ['끝 색', 'color'],
	highlight: ['밝은 영역 색', 'color'], shadow: ['어두운 영역 색', 'color'],
	opacity: ['불투명도(%)', 'range', 0, 100], angle: ['각도(°)', 'range', -180, 180],
	distance: ['거리(px)', 'range', 0, 200], size: ['크기(px)', 'range', 0, 150], depth: ['깊이(%)', 'range', 1, 500],
	position: ['위치', 'select', ['outside', 'inside', 'center'], ['바깥쪽', '안쪽', '가운데']],
};

/**
 * Layer > Layer Style (double click a layer): effects with live preview
 */
class Layer_styles_class {

	constructor() {
		this.dialog = new Adjust_dialog();
	}

	blending_options() { this.open(); }
	drop_shadow() { this.open('drop_shadow'); }
	stroke() { this.open('stroke'); }
	outer_glow() { this.open('outer_glow'); }
	color_overlay() { this.open('color_overlay'); }

	clear() {
		var layer = config.layer;
		if (!layer || !layer.styles) return;
		var action = new app.Actions.Update_layer_action(layer.id, { styles: null });
		action.action_description = '레이어 스타일 지우기';
		app.State.do_action(action);
	}

	open(focus) {
		var _this = this;
		var layer = config.layer;
		if (!layer || layer.type == null || layer.type == 'adjustment' || layer.type == 'group') {
			alertify.error('픽셀, 문자, 도형 레이어에 레이어 스타일을 쓸 수 있습니다.');
			return;
		}
		var original = layer.styles;
		var styles = {};
		ORDER.forEach(function (k) {
			styles[k] = Object.assign({}, STYLE_DEFAULTS[k], original && original[k] ? original[k] : {});
		});
		if (focus) styles[focus].enabled = true;
		var current = focus || ORDER.find(function (k) { return styles[k].enabled; }) || 'drop_shadow';
		var root = null;

		var apply_live = function () {
			layer.styles = JSON.parse(JSON.stringify(styles));
			config.need_render = true;
		};
		var render_fields = function () {
			var box = root.querySelector('.ls_fields');
			var s = styles[current];
			var html = '<div class="adj_group">' + STYLE_NAMES[current] + '</div>';
			Object.keys(s).forEach(function (field) {
				if (field == 'enabled' || !FIELDS[field]) return;
				var f = FIELDS[field];
				if (f[1] == 'color') {
					html += '<div class="adj_row"><label>' + f[0] + '</label><input type="color" data-field="' + field + '" value="' + s[field] + '"></div>';
				}
				else if (f[1] == 'select') {
					html += '<div class="adj_row"><label>' + f[0] + '</label><select class="adj_select" data-field="' + field + '">'
						+ f[2].map(function (v, i) { return '<option value="' + v + '"' + (s[field] == v ? ' selected' : '') + '>' + f[3][i] + '</option>'; }).join('')
						+ '</select></div>';
				}
				else {
					html += '<div class="adj_row"><label>' + f[0] + '</label><input type="range" data-field="' + field + '" min="' + f[2] + '" max="' + f[3] + '" value="' + s[field] + '">'
						+ '<input type="number" class="adj_num" data-mirror="' + field + '" value="' + s[field] + '"></div>';
				}
			});
			box.innerHTML = html;
			box.querySelectorAll('[data-field]').forEach(function (input) {
				input.addEventListener('input', function () {
					var v = input.type == 'range' ? parseFloat(input.value) : input.value;
					styles[current][input.dataset.field] = v;
					styles[current].enabled = true;
					var mirror = box.querySelector('[data-mirror="' + input.dataset.field + '"]');
					if (mirror) mirror.value = input.value;
					root.querySelector('.ls_item[data-key="' + current + '"] input').checked = true;
					apply_live();
				});
			});
			box.querySelectorAll('[data-mirror]').forEach(function (num) {
				num.addEventListener('input', function () {
					var range = box.querySelector('[data-field="' + num.dataset.mirror + '"]');
					range.value = num.value;
					range.dispatchEvent(new Event('input'));
				});
			});
			root.querySelectorAll('.ls_item').forEach(function (item) { item.classList.toggle('current', item.dataset.key == current); });
		};
		var body = '<div class="ls_wrap"><div class="ls_list">'
			+ ORDER.map(function (k) {
				return '<label class="ls_item" data-key="' + k + '"><input type="checkbox"' + (styles[k].enabled ? ' checked' : '') + '> ' + STYLE_NAMES[k] + '</label>';
			}).join('')
			+ '</div><div class="ls_fields"></div></div>';
		this.dialog.open({
			title: '레이어 스타일',
			body: body,
			on_open: function (el) {
				root = el;
				el.classList.add('adj_wide', 'ls_dialog');
				el.querySelectorAll('.ls_item').forEach(function (item) {
					item.addEventListener('click', function (e) {
						current = item.dataset.key;
						if (e.target.tagName == 'INPUT') {
							styles[current].enabled = e.target.checked;
							apply_live();
						}
						render_fields();
					});
				});
				render_fields();
				apply_live();
			},
			on_reset: function () {
				ORDER.forEach(function (k) { styles[k] = Object.assign({}, STYLE_DEFAULTS[k]); });
				root.querySelectorAll('.ls_item input').forEach(function (c) { c.checked = false; });
				render_fields();
				apply_live();
			},
			on_preview_toggle: function (on) {
				layer.styles = on ? JSON.parse(JSON.stringify(styles)) : original;
				config.need_render = true;
			},
			on_ok: function () {
				layer.styles = original;
				var next = {};
				ORDER.forEach(function (k) { if (styles[k].enabled) next[k] = styles[k]; });
				var action = new app.Actions.Update_layer_action(layer.id, { styles: Object.keys(next).length ? next : null });
				action.action_description = '레이어 스타일';
				app.State.do_action(action);
			},
			on_cancel: function () {
				layer.styles = original;
				config.need_render = true;
			},
		});
	}
}

export default Layer_styles_class;
