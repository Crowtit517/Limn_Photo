/*
 * Layers panel - raster painting app style:
 * thumbnails, blend mode + opacity of active layer, clipping, drag & drop ordering.
 * Based on miniPaint - https://github.com/viliusle/miniPaint
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Layer_rename_class from './../../modules/layer/rename.js';
import Effects_browser_class from './../../modules/effects/browser.js';
import Layer_duplicate_class from './../../modules/layer/duplicate.js';
import Layer_raster_class from './../../modules/layer/raster.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import { parent_group } from './../../modules/layer/group.js';
import { show_layer_menu } from './layer-context-menu.js';
import { pixel_stamp } from './../layer-surface.js';

const CLIP_MODE = 'source-atop';

// [canvas composite operation, label]
// Photoshop order; null = separator
const BLEND_MODES = [
	['source-over', '표준'],
	['ps-dissolve', '디졸브'],
	null,
	['darken', '어둡게 하기'],
	['multiply', '곱하기'],
	['color-burn', '색상 번'],
	['ps-linear-burn', '선형 번'],
	['ps-darker-color', '어두운 색상'],
	null,
	['lighten', '밝게 하기'],
	['screen', '스크린'],
	['color-dodge', '색상 닷지'],
	['lighter', '선형 닷지(추가)'],
	['ps-lighter-color', '밝은 색상'],
	null,
	['overlay', '오버레이'],
	['soft-light', '소프트 라이트'],
	['hard-light', '하드 라이트'],
	['ps-vivid-light', '선명한 라이트'],
	['ps-linear-light', '선형 라이트'],
	['ps-pin-light', '핀 라이트'],
	['ps-hard-mix', '하드 혼합'],
	null,
	['difference', '차이'],
	['exclusion', '제외'],
	['ps-subtract', '빼기'],
	['ps-divide', '나누기'],
	null,
	['hue', '색조'],
	['saturation', '채도'],
	['color', '색상'],
	['luminosity', '광도'],
];

const ICONS = {
	eye: '<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"/></svg>',
	add: '<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5zM14 4v4h4M12 10v8M8 14h8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	duplicate: '<svg viewBox="0 0 24 24"><path d="M8 8h12v12H8zM4 4h12v3M4 4v12h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	merge: '<svg viewBox="0 0 24 24"><path d="M12 3v10M7 9l5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
	clip: '<svg viewBox="0 0 24 24"><path d="M7 3v9a5 5 0 0 0 10 0V6a3 3 0 0 0-6 0v7a1 1 0 0 0 2 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
	down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
	raster: '<svg viewBox="0 0 24 24"><path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z"/></svg>',
	mask: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4"/></svg>',
	lock_pixels: '<svg viewBox="0 0 24 24"><path d="M5 19L19 5M9 19l10-10M5 15L15 5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
	lock_position: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
	lock_all: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
	folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	adjust: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 0 0 0 16z"/></svg>',
	trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

const TYPE_LABELS = {
	image: '래스터', text: '텍스트', brush: '브러시', pencil: '연필', gradient: '그라디언트',
	clone: '복제', media: '미디어', adjustment: '조정', group: '그룹',
};

var template = `
	<div class="lp_props">
		<div class="lp_row">
			<select id="lp_blend" class="lp_blend" title="합성 모드"></select>
		</div>
		<div class="lp_row">
			<span class="lp_label">불투명도</span>
			<input type="range" id="lp_opacity" min="0" max="100" step="1">
			<span class="lp_value" id="lp_opacity_value">100%</span>
		</div>
		<div class="lp_row">
			<span class="lp_label">잠그기</span>
			<span class="lp_locks">
				<button type="button" data-lock="pixels" title="이미지 픽셀 잠그기">${ICONS.lock_pixels}</button>
				<button type="button" data-lock="position" title="위치 잠그기">${ICONS.lock_position}</button>
				<button type="button" data-lock="all" title="모두 잠그기">${ICONS.lock_all}</button>
			</span>
			<span class="lp_label lp_fill_label">칠</span>
			<input type="range" id="lp_fill" min="0" max="100" step="1">
			<span class="lp_value" id="lp_fill_value">100%</span>
		</div>
	</div>
	<div class="lp_toolbar">
		<button type="button" data-cmd="add" title="새 레이어">${ICONS.add}</button>
		<button type="button" data-cmd="duplicate" title="레이어 복제">${ICONS.duplicate}</button>
		<button type="button" data-cmd="merge" title="아래 레이어와 결합">${ICONS.merge}</button>
		<button type="button" data-cmd="mask" title="레이어 마스크 추가 (모두 나타내기)">${ICONS.mask}</button>
		<button type="button" data-cmd="adjust" title="새 칠 또는 조정 레이어 만들기">${ICONS.adjust}</button>
		<button type="button" data-cmd="fx" title="레이어 스타일 추가">fx</button>
		<button type="button" data-cmd="group" title="새 그룹 만들기 (Ctrl+G: 레이어 그룹화)">${ICONS.folder}</button>
		<button type="button" data-cmd="clip" id="lp_clip" title="아래 레이어에서 클리핑">${ICONS.clip}</button>
		<button type="button" data-cmd="raster" title="래스터화">${ICONS.raster}</button>
		<span class="lp_spacer"></span>
		<button type="button" data-cmd="up" title="위로 이동">${ICONS.up}</button>
		<button type="button" data-cmd="down" title="아래로 이동">${ICONS.down}</button>
		<button type="button" data-cmd="delete" title="레이어 삭제">${ICONS.trash}</button>
	</div>
	<div class="layers_list" id="layers"></div>
`;

/**
 * GUI class responsible for rendering layers on right sidebar
 */
class GUI_layers_class {

	constructor(ctx) {
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Layer_rename = new Layer_rename_class();
		this.Effects_browser = new Effects_browser_class();
		this.Layer_duplicate = new Layer_duplicate_class();
		this.Layer_raster = new Layer_raster_class();
		this.Tools_translate = new Tools_translate_class();
		this.thumb_timer = null;
		this.drag_id = null;
	}

	render_main_layers() {
		document.getElementById('layers_base').innerHTML = template;
		var blend = document.getElementById('lp_blend');
		for (const mode of BLEND_MODES) {
			if (!mode) {
				var separator = document.createElement('option');
				separator.disabled = true;
				separator.textContent = '──────────';
				blend.appendChild(separator);
				continue;
			}
			const [value, label] = mode;
			var option = document.createElement('option');
			option.value = value;
			option.textContent = label;
			blend.appendChild(option);
		}
		this.render_layers();
		this.set_events();
		this.watch_history();
	}

	/**
	 * Thumbnails follow every change, including undo / redo.
	 */
	watch_history() {
		var _this = this;
		var state = app.State;
		if (!state || state._lp_wrapped) {
			return;
		}
		state._lp_wrapped = true;
		for (const method of ['do_action', 'undo_action', 'redo_action']) {
			const original = state[method].bind(state);
			state[method] = async function () {
				var result = await original.apply(null, arguments);
				_this.schedule_thumbs();
				return result;
			};
		}
	}

	set_events() {
		var _this = this;
		var base = document.getElementById('layers_base');

		base.addEventListener('click', function (event) {
			var button = event.target.closest('button');
			if (button && button.dataset.cmd) {
				_this.run_command(button.dataset.cmd);
				return;
			}
			var mask_thumb = event.target.closest('.lp_mask_thumb');
			var layer_thumb = event.target.closest('.lp_thumb');
			if (mask_thumb || layer_thumb) {
				_this.on_thumb_click(mask_thumb || layer_thumb, mask_thumb != null, event.shiftKey);
				return;
			}
			var fold = event.target.closest('.lp_fold');
			if (fold) {
				event.stopPropagation();
				var group = config.layers.find(function (l) { return l.id == fold.dataset.id; });
				if (group) {
					group._collapsed = !group._collapsed;
					_this.render_layers();
				}
				return;
			}
			var eye = event.target.closest('.lp_eye');
			if (eye) {
				event.stopPropagation();
				app.State.do_action(new app.Actions.Toggle_layer_visibility_action(eye.dataset.id));
				return;
			}
			var smart_row = event.target.closest('.lp_smart_filter');
			if (smart_row) {
				var smart_layer = config.layers.find(function (l) { return l.id == smart_row.dataset.pid; });
				var smart_index = parseInt(smart_row.dataset.index);
				if (event.target.closest('.lp_sf_toggle')) app.GUI.modules['layer/smart'].toggle_filter(smart_layer, smart_index);
				else if (event.target.closest('.lp_sf_delete')) app.GUI.modules['layer/smart'].delete_filter(smart_layer, smart_index);
				return;
			}
			var del_filter = event.target.closest('.lp_filter_delete');
			if (del_filter) {
				app.State.do_action(
					new app.Actions.Delete_layer_filter_action(del_filter.dataset.pid, del_filter.dataset.id)
				);
				return;
			}
			var filter = event.target.closest('.lp_filter_name');
			if (filter) {
				_this.edit_filter(filter);
				return;
			}
			var row = event.target.closest('.lp_item');
			if (row && row.dataset.id != config.layer.id) {
				app.State.do_action(new app.Actions.Select_layer_action(row.dataset.id));
			}
		});

		base.addEventListener('dblclick', function (event) {
			var row = event.target.closest('.lp_item');
			if (row && event.target.closest('.lp_name')) {
				_this.Layer_rename.rename(row.dataset.id);
				return;
			}
			var smart_edit = event.target.closest('.lp_smart_filter');
			if (smart_edit) {
				var sl = config.layers.find(function (l) { return l.id == smart_edit.dataset.pid; });
				app.GUI.modules['layer/smart'].edit_filter(sl, parseInt(smart_edit.dataset.index));
				return;
			}
			var layer = row ? config.layers.find(function (l) { return l.id == row.dataset.id; }) : null;
			if (layer && layer.type == 'adjustment' && !event.target.closest('.lp_mask_thumb, .lp_eye')) {
				app.GUI.modules['layer/adjustment'].edit(layer);
			}
			else if (layer && layer.type != 'group' && !event.target.closest('.lp_mask_thumb, .lp_eye, .lp_thumb, .lp_fold')) {
				//double click the row = Layer Style (Photoshop)
				if (config.layer.id != layer.id) app.State.do_action(new app.Actions.Select_layer_action(layer.id));
				app.GUI.modules['layer/styles'].open();
			}
		});

		//blend mode
		document.getElementById('lp_blend').addEventListener('change', function () {
			app.State.do_action(new app.Actions.Update_layer_action(config.layer.id, { composition: this.value }));
		});

		//opacity: live preview while dragging, one history entry on release
		var opacity = document.getElementById('lp_opacity');
		opacity.addEventListener('input', function () {
			if (_this.opacity_start == null) {
				_this.opacity_start = config.layer.opacity;
			}
			config.layer.opacity = parseInt(this.value);
			document.getElementById('lp_opacity_value').textContent = this.value + '%';
			config.need_render = true;
		});
		opacity.addEventListener('change', function () {
			var value = parseInt(this.value);
			if (_this.opacity_start != null) {
				config.layer.opacity = _this.opacity_start;
				_this.opacity_start = null;
			}
			app.State.do_action(new app.Actions.Update_layer_action(config.layer.id, { opacity: value }));
		});

		//fill opacity: like opacity, but layer styles keep full strength
		var fill = document.getElementById('lp_fill');
		fill.addEventListener('input', function () {
			if (_this.fill_start == null) _this.fill_start = config.layer.fill_opacity == null ? 100 : config.layer.fill_opacity;
			config.layer.fill_opacity = parseInt(this.value);
			document.getElementById('lp_fill_value').textContent = this.value + '%';
			config.need_render = true;
		});
		fill.addEventListener('change', function () {
			var value = parseInt(this.value);
			if (_this.fill_start != null) {
				config.layer.fill_opacity = _this.fill_start;
				_this.fill_start = null;
			}
			var action = new app.Actions.Update_layer_action(config.layer.id, { fill_opacity: value });
			action.action_description = '칠 불투명도 변경';
			app.State.do_action(action);
		});
		base.querySelector('.lp_locks').addEventListener('click', function (event) {
			var button = event.target.closest('[data-lock]');
			if (!button || !config.layer) return;
			var locks = Object.assign({ pixels: false, position: false, all: false }, config.layer.locks || {});
			locks[button.dataset.lock] = !locks[button.dataset.lock];
			var action = new app.Actions.Update_layer_action(config.layer.id, { locks: locks });
			action.action_description = '레이어 잠그기';
			app.State.do_action(action);
		});

		//right click: Photoshop layer context menu (selects the layer first)
		base.addEventListener('contextmenu', async function (event) {
			var row = event.target.closest('.lp_item');
			if (!row) return;
			event.preventDefault();
			var layer = config.layers.find(function (l) { return l.id == parseInt(row.dataset.id); });
			if (!layer) return;
			if (config.layer !== layer) await app.State.do_action(new app.Actions.Select_layer_action(layer.id));
			show_layer_menu(event, layer);
		});

		//drag & drop ordering
		base.addEventListener('dragstart', function (event) {
			var row = event.target.closest('.lp_item');
			if (!row) return;
			_this.drag_id = parseInt(row.dataset.id);
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', row.dataset.id);
			row.classList.add('dragging');
		});
		base.addEventListener('dragover', function (event) {
			var row = event.target.closest('.lp_item');
			if (_this.drag_id == null || !row) return;
			event.preventDefault();
			var rect = row.getBoundingClientRect();
			var after = event.clientY > rect.top + rect.height / 2;
			_this.clear_drop_marks();
			row.classList.add(after ? 'drop_after' : 'drop_before');
		});
		base.addEventListener('drop', function (event) {
			var row = event.target.closest('.lp_item');
			if (_this.drag_id == null || !row) return;
			event.preventDefault();
			event.stopPropagation();
			var rect = row.getBoundingClientRect();
			var after = event.clientY > rect.top + rect.height / 2;
			_this.move_layer_to(_this.drag_id, parseInt(row.dataset.id), after);
		});
		base.addEventListener('dragend', function () {
			_this.drag_id = null;
			_this.clear_drop_marks();
		});
	}

	clear_drop_marks() {
		document.querySelectorAll('.lp_item.drop_before, .lp_item.drop_after, .lp_item.dragging').forEach(function (el) {
			el.classList.remove('drop_before', 'drop_after', 'dragging');
		});
	}

	/**
	 * moves layer next to other layer (list is top-first, so "after" means below)
	 */
	move_layer_to(layer_id, target_id, after) {
		if (layer_id == target_id) return;
		var list = this.get_list();
		var from = list.findIndex(function (l) { return l.id == layer_id; });
		var to = list.findIndex(function (l) { return l.id == target_id; });
		if (after) to++;
		if (from < to) to--;
		var steps = from - to; //positive = move up
		if (steps == 0) return;
		var actions = [];
		for (var i = 0; i < Math.abs(steps); i++) {
			actions.push(new app.Actions.Reorder_layer_action(layer_id, steps > 0 ? 1 : -1));
		}
		app.State.do_action(new app.Actions.Bundle_action('reorder_layer', 'Reorder Layer', actions));
	}

	run_command(cmd) {
		var layer = config.layer;
		if (cmd == 'add') {
			app.State.do_action(new app.Actions.Insert_layer_action({
				name: this.next_layer_name(),
			}));
		}
		else if (cmd == 'duplicate') {
			this.Layer_duplicate.duplicate();
		}
		else if (cmd == 'merge') {
			app.GUI.modules['layer/merge'].merge();
		}
		else if (cmd == 'mask') {
			app.GUI.modules['layer/mask'].reveal_all();
		}
		else if (cmd == 'adjust') {
			this.show_adjust_menu();
		}
		else if (cmd == 'fx') {
			app.GUI.modules['layer/styles'].open();
		}
		else if (cmd == 'group') {
			app.GUI.modules['layer/group'].new_group();
		}
		else if (cmd == 'clip') {
			var composition = layer.composition == CLIP_MODE ? 'source-over' : CLIP_MODE;
			app.State.do_action(new app.Actions.Update_layer_action(layer.id, { composition: composition }));
		}
		else if (cmd == 'raster') {
			this.Layer_raster.raster();
		}
		else if (cmd == 'up') {
			app.State.do_action(new app.Actions.Reorder_layer_action(layer.id, 1));
		}
		else if (cmd == 'down') {
			app.State.do_action(new app.Actions.Reorder_layer_action(layer.id, -1));
		}
		else if (cmd == 'delete') {
			app.State.do_action(new app.Actions.Delete_layer_action(layer.id));
		}
	}

	/**
	 * layer ids skip numbers (paint strokes use temporary layers), so name by count
	 */
	next_layer_name() {
		var names = config.layers.map(function (l) { return l.name; });
		var n = config.layers.length + 1;
		while (names.includes('레이어 ' + n)) n++;
		return '레이어 ' + n;
	}

	/**
	 * layer thumb = paint pixels, mask thumb = paint mask, shift + mask thumb = mask on/off
	 */
	async on_thumb_click(element, is_mask, shift) {
		var id = parseInt(element.dataset.id);
		if (id != config.layer.id) {
			await app.State.do_action(new app.Actions.Select_layer_action(id));
		}
		var mask_module = app.GUI.modules['layer/mask'];
		if (is_mask && shift) {
			mask_module.toggle();
		}
		else if (is_mask) {
			mask_module.edit_mask();
		}
		else {
			mask_module.edit_pixels();
		}
	}

	edit_filter(target) {
		var effects = this.Effects_browser.get_effects_list();
		var key = target.dataset.filter.toLowerCase();
		for (var i in effects) {
			if (effects[i].title.toLowerCase() == key) {
				this.Base_layers.select(target.dataset.pid);
				var function_name = this.Effects_browser.get_function_from_path(key);
				effects[i].object[function_name](target.dataset.id);
			}
		}
	}

	get_list() {
		return config.layers.concat().sort((a, b) => b.order - a.order);
	}

	/**
	 * renders layers list
	 */
	render_layers() {
		var container = document.getElementById('layers');
		if (!container) return;
		var layers = this.get_list();
		var html = '';

		if (config.layer) {
			//while a brush stroke is painted, its temporary layer is hidden and the painted layer stays selected
			var raster = window.RasterCommit;
			var active_id = raster && raster.stroke_target_id() != null && raster.is_stroke_layer(config.layer)
				? raster.stroke_target_id() : config.layer.id;
			for (var i in layers) {
				var value = layers[i];
				if (raster && raster.is_stroke_layer(value)) continue;
				var classes = 'lp_item';
				if (value.id == active_id) classes += ' active';
				if (value.visible == false) classes += ' hidden_layer';
				var clipped = value.composition === CLIP_MODE;
				if (clipped) classes += ' clipped';

				var blend_label = this.get_blend_label(value.composition);
				var sub = value.opacity + '% · ' + blend_label + (value._mask ? ' · 마스크' : '');
				var type_label = TYPE_LABELS[value.type] || (value.type == null ? '빈 레이어' : '도형');
				//group nesting: indent, hide rows of collapsed groups
				var depth = 0, hidden_by_fold = false, up = parent_group(value), guard = 0;
				while (up && guard++ < 20) {
					depth++;
					if (up._collapsed) hidden_by_fold = true;
					up = parent_group(up);
				}
				if (hidden_by_fold) continue;
				if (value.type == 'group') classes += ' lp_group';

				html += '<div class="' + classes + '" data-id="' + value.id + '" draggable="true" style="padding-left:' + (depth * 16) + 'px">';
				html += '	<button type="button" class="lp_eye' + (value.visible ? ' on' : '') + '" data-id="' + value.id
					+ '" title="' + (value.visible ? '숨기기' : '보이기') + '">' + ICONS.eye + '</button>';
				if (clipped) html += '	<span class="lp_clip_mark" title="클리핑"></span>';
				var editing_mask = value._mask && value._mask_editing;
				if (value.type == 'adjustment') {
					html += '	<span class="lp_adj_thumb" data-id="' + value.id + '" title="조정 설정 (더블클릭)">' + ICONS.adjust + '</span>';
				}
				else if (value.type == 'group') {
					html += '	<span class="lp_fold' + (value._collapsed ? '' : ' open') + '" data-id="' + value.id + '" title="그룹 펼치기/접기">▸</span>';
					html += '	<span class="lp_adj_thumb lp_folder" data-id="' + value.id + '">' + ICONS.folder + '</span>';
				}
				else {
					html += '	<canvas class="lp_thumb' + (value.id == active_id && value._mask && !editing_mask ? ' editing' : '')
						+ '" width="48" height="36" data-id="' + value.id + '" title="픽셀 편집"></canvas>';
				}
				if (value._mask) {
					html += '	<canvas class="lp_mask_thumb' + (editing_mask ? ' editing' : '') + (value._mask.enabled === false ? ' off' : '')
						+ '" width="48" height="36" data-id="' + value.id + '" title="마스크 편집 (Shift+클릭: 사용/사용 안 함)"></canvas>';
				}
				html += '	<div class="lp_text">';
				html += '		<div class="lp_name">' + this.Helper.escapeHtml(value.name) + '</div>';
				var lock_mark = value.locks && (value.locks.all || value.locks.pixels || value.locks.position) ? ' 🔒' : '';
				var fx_mark = value.styles && Object.keys(value.styles).some(function (k) { return value.styles[k] && value.styles[k].enabled; }) ? ' · fx' : '';
				var smart_mark = value.smart ? ' · 스마트 오브젝트' : '';
				html += '		<div class="lp_sub">' + sub + ' · ' + type_label + smart_mark + fx_mark + lock_mark + '</div>';
				html += '	</div>';
				html += '</div>';

				//smart filters (editable later)
				if (value.smart && value.smart.filters && value.smart.filters.length) {
					html += '<div class="lp_filters lp_smart">';
					html += '<div class="lp_filter"><span class="lp_fx">⧉</span><span class="lp_filter_name">고급 필터</span></div>';
					value.smart.filters.forEach(function (f, fi) {
						html += '<div class="lp_filter lp_smart_filter" data-pid="' + value.id + '" data-index="' + fi + '">'
							+ '<input type="checkbox" class="lp_sf_toggle"' + (f.enabled === false ? '' : ' checked') + '>'
							+ '<span class="lp_filter_name lp_sf_name">' + (f.title || f.op) + '</span>'
							+ '<span class="lp_filter_delete lp_sf_delete" title="삭제">×</span></div>';
					});
					html += '</div>';
				}

				//filters
				if (value.filters.length > 0) {
					html += '<div class="lp_filters">';
					for (var j in value.filters) {
						var filter = value.filters[j];
						var title = this.Helper.ucfirst(filter.name).replace(/-/g, ' ');
						html += '<div class="lp_filter">';
						html += '	<span class="lp_fx">fx</span>';
						html += '	<span class="lp_filter_name trn" data-pid="' + value.id + '" data-id="' + filter.id
							+ '" data-filter="' + filter.name + '">' + title + '</span>';
						html += '	<span class="lp_filter_delete" data-pid="' + value.id + '" data-id="' + filter.id + '" title="삭제">×</span>';
						html += '</div>';
					}
					html += '</div>';
				}
			}
		}

		container.innerHTML = html;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, container);
		}
		this.render_props();
		this.render_thumbs();
	}

	/**
	 * popup of adjustment layer types under the panel button
	 */
	show_adjust_menu() {
		var old = document.querySelector('.lp_adj_menu');
		if (old) {
			old.remove();
			return;
		}
		var button = document.querySelector('.lp_toolbar [data-cmd=adjust]');
		var rect = button.getBoundingClientRect();
		var menu = document.createElement('div');
		menu.className = 'lp_adj_menu';
		var items = [
			['brightness_contrast', '명도/대비...'], ['levels', '레벨...'], ['curves', '곡선...'],
			null, ['hue_saturation', '색조/채도...'], ['color_balance', '색상 균형...'], ['black_white', '흑백'],
			['selective_color', '선택 색상...'], ['gradient_map', '그레이디언트 맵...'], ['color_lookup', '색상 검색...'],
			null, ['invert', '반전'],
		];
		items.forEach(function (item) {
			var el = document.createElement('div');
			if (!item) {
				el.className = 'lp_adj_sep';
			}
			else {
				el.className = 'lp_adj_item';
				el.textContent = item[1];
				el.addEventListener('click', function () {
					menu.remove();
					app.GUI.modules['layer/adjustment'][item[0]]();
				});
			}
			menu.appendChild(el);
		});
		document.body.appendChild(menu);
		menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
		menu.style.top = Math.max(8, rect.top - menu.offsetHeight - 4) + 'px';
		setTimeout(function () {
			document.addEventListener('mousedown', function close(e) {
				if (!menu.contains(e.target)) {
					menu.remove();
				}
				document.removeEventListener('mousedown', close, true);
			}, true);
		}, 0);
	}

	get_blend_label(composition) {
		if (composition === CLIP_MODE) return '클리핑';
		var mode = BLEND_MODES.find(function (m) { return m && m[0] == composition; });
		return mode ? mode[1] : composition;
	}

	render_props() {
		var layer = config.layer;
		var blend = document.getElementById('lp_blend');
		var opacity = document.getElementById('lp_opacity');
		if (!layer || !blend) return;
		var clipped = layer.composition === CLIP_MODE;
		blend.value = clipped ? 'source-over' : layer.composition;
		blend.disabled = clipped;
		blend.title = clipped ? '클리핑 중에는 표준으로 합성됩니다' : '합성 모드';
		opacity.value = layer.opacity;
		document.getElementById('lp_opacity_value').textContent = layer.opacity + '%';
		var fill_value = layer.fill_opacity == null ? 100 : layer.fill_opacity;
		document.getElementById('lp_fill').value = fill_value;
		document.getElementById('lp_fill_value').textContent = fill_value + '%';
		var locks = layer.locks || {};
		document.querySelectorAll('.lp_locks [data-lock]').forEach(function (button) {
			button.classList.toggle('on', !!locks[button.dataset.lock]);
		});
		document.getElementById('lp_clip').classList.toggle('on', clipped);
	}

	schedule_thumbs() {
		var _this = this;
		clearTimeout(this.thumb_timer);
		this.thumb_timer = setTimeout(function () {
			if (_this.drag_id == null) {
				_this.render_layers();
			}
		}, 60);
	}

	render_thumbs() {
		var _this = this;
		document.querySelectorAll('#layers .lp_mask_thumb').forEach(function (canvas) {
			var layer = config.layers.find(function (l) { return l.id == canvas.dataset.id; });
			if (!layer || !layer._mask) return;
			var ctx = canvas.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			var m = layer._mask.canvas;
			var scale = Math.min(canvas.width / m.width, canvas.height / m.height);
			ctx.drawImage(m, (canvas.width - m.width * scale) / 2, (canvas.height - m.height * scale) / 2, m.width * scale, m.height * scale);
		});
		var thumbs = document.querySelectorAll('#layers .lp_thumb');
		if (!config.WIDTH || !config.HEIGHT) return;
		thumbs.forEach(function (canvas) {
			var layer = config.layers.find(function (l) { return l.id == canvas.dataset.id; });
			if (!layer) return;
			var ctx = canvas.getContext('2d');
			//high quality downscale keeps thin lines continuous
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			if (layer.type == null) return;
			if (layer.type == 'image' && layer.link && !layer.link.complete) {
				layer.link.addEventListener('load', function () { _this.schedule_thumbs(); }, { once: true });
				return;
			}
			//pixel layers: reuse the thumbnail until the pixels or placement change
			//(downscaling a big photo for every panel refresh made layer clicks slow)
			var key = null;
			if (layer.type == 'image') {
				key = [pixel_stamp(layer), layer.x, layer.y, layer.width, layer.height, layer.rotate, config.WIDTH, config.HEIGHT,
					canvas.width, canvas.height, JSON.stringify(layer.filters || []), layer.smart ? JSON.stringify(layer.smart.filters || []) : ''].join('|');
				var cached = _this.thumb_cache && _this.thumb_cache.get(layer.id);
				if (cached && cached.key == key) {
					ctx.drawImage(cached.canvas, 0, 0);
					return;
				}
			}
			var scale = Math.min(canvas.width / config.WIDTH, canvas.height / config.HEIGHT);
			ctx.save();
			ctx.translate((canvas.width - config.WIDTH * scale) / 2, (canvas.height - config.HEIGHT * scale) / 2);
			ctx.scale(scale, scale);
			try {
				_this.Base_layers.render_object(ctx, Object.assign({}, layer, { visible: true, status: null, _mask: null }), true);
			}
			catch (e) {
				//thumbnail is cosmetic only
			}
			ctx.restore();
			if (key) {
				if (!_this.thumb_cache) _this.thumb_cache = new Map();
				var copy = document.createElement('canvas');
				copy.width = canvas.width;
				copy.height = canvas.height;
				copy.getContext('2d').drawImage(canvas, 0, 0);
				_this.thumb_cache.set(layer.id, { key: key, canvas: copy });
			}
		});
	}
}

export default GUI_layers_class;
