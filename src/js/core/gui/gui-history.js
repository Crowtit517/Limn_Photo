/*
 * History panel (Photoshop "작업 내역"): list of undo steps,
 * click a step to go back (later steps turn grey until a new action replaces them).
 */
import app from './../../app.js';

// action id -> Photoshop style name (used when action has no Korean description)
const NAMES = {
	new_file: '새로 만들기',
	open_image: '열기', open_psd_file: '열기', open_json_file: '열기', open_file_url: '열기',
	open_file_data_url: '열기', open_file_webcam: '열기',
	new_layer: '새 레이어', insert_layer: '새 레이어',
	delete_layer: '레이어 삭제', duplicate_layer: '레이어 복제', merge_layers: '아래 레이어와 병합',
	flatten_image: '이미지 병합', reorder_layer: '레이어 순서', rename_layer: '레이어 이름 바꾸기',
	change_opacity: '불투명도 변경', change_composition: '혼합 모드 변경',
	toggle_layer_visibility: '레이어 표시/숨기기', select_layer: '레이어 선택',
	select_next_layer: '레이어 선택', select_previous_layer: '레이어 선택',
	convert_to_raster: '레이어 래스터화', clear_layer: '레이어 지우기',
	brush: '브러시 도구', new_brush_layer: '브러시 도구', update_brush_layer: '브러시 도구',
	pencil: '연필 도구', new_pencil_layer: '연필 도구', update_pencil_layer: '연필 도구',
	erase: '지우개', erase_tool: '지우개', magic_erase_tool: '자동 지우개',
	clone: '복제 도장', clone_tool: '복제 도장', blur_tool: '흐림 효과 도구', sharpen_tool: '선명 효과 도구',
	desaturate_tool: '스펀지 도구', bulge_pinch_tool: '픽셀 유동화',
	fill_tool: '페인트 통', new_gradient_layer: '그레이디언트',
	new_text_layer: '문자 도구', select_text_layer: '문자 도구', resize_text_layer: '문자 크기 조절',
	new_rectangle_layer: '사각형 도구', new_ellipse_layer: '타원 도구', new_polygon_layer: '다각형 도구',
	new_line_layer: '선 도구', new_bezier_layer: '펜 도구',
	move_layer: '이동', translate_layer: '이동', resize_layer: '크기 조절', resize_layers: '크기 조절',
	rotate_layer: '회전', crop_tool: '자르기', trim_layers: '재단', set_image_size: '캔버스 크기',
	change_layer_details: '레이어 속성', update_layer: '레이어 속성', update_layer_image: '픽셀 변경',
	paint_on_layer: '칠하기', paint_on_mask: '마스크 칠하기', apply_mask: '레이어 마스크 적용',
	update_mask: '레이어 마스크', add_layer_filter: '필터', delete_layer_filter: '필터 삭제',
	clear_selection: '지우기', delete_selection: '지우기', select_all: '모두 선택',
	set_selection: '선택', reset_selection: '선택 해제', content_fill: '내용 인식 채우기',
	free_transform: '자유 변형', adjustment_layer: '조정 레이어',
};

function has_korean(text) {
	return /[가-힣]/.test(text || '');
}

export function history_name(action) {
	if (!action) return '';
	if (has_korean(action.action_description)) return action.action_description;
	if (NAMES[action.action_id]) return NAMES[action.action_id];
	if (/^new_.*_layer$/.test(action.action_id)) return '새 도형';
	return action.action_description || action.action_id;
}

class GUI_history_class {

	constructor() {
		this.busy = false;
		this.queued = false;
		var _this = this;
		window.addEventListener('photolab-history', function () {
			_this.schedule();
		});
		window.addEventListener('load', function () {
			setTimeout(function () { _this.schedule(); }, 300);
		});
		//tools sometimes join steps after mouse up
		document.addEventListener('mouseup', function () {
			setTimeout(function () { _this.schedule(); }, 400);
		});
	}

	schedule() {
		if (this.queued) return;
		this.queued = true;
		var _this = this;
		setTimeout(function () {
			_this.queued = false;
			_this.render();
		}, 30);
	}

	render() {
		var box = document.getElementById('history_list');
		if (!box) return;
		var state = app.State;
		if (!state) return;
		var list = state.action_history;
		var index = state.action_history_index;

		var key = list.length + ':' + index + ':' + list.map(function (a) { return a.action_id + a.action_description; }).join('|');
		if (key == this.last_key) return;
		this.last_key = key;

		box.innerHTML = '';
		var _this = this;
		var add_row = function (label, target, cls) {
			var row = document.createElement('div');
			row.className = 'hp_row ' + cls;
			row.innerHTML = '<span class="hp_icon"></span><span class="hp_name"></span>';
			row.querySelector('.hp_name').textContent = label;
			row.title = label;
			row.addEventListener('click', function () {
				_this.go_to(target);
			});
			box.appendChild(row);
			return row;
		};
		add_row('원본 상태', 0, 'hp_snapshot' + (index == 0 ? ' current' : ''));
		var current = null;
		for (var i = 0; i < list.length; i++) {
			var cls = i + 1 == index ? 'current' : (i + 1 > index ? 'future' : '');
			var row = add_row(history_name(list[i]), i + 1, cls);
			if (i + 1 == index) current = row;
		}
		if (current) {
			current.scrollIntoView({ block: 'nearest' });
		}
	}

	/**
	 * undo / redo until given number of steps is applied
	 */
	async go_to(target) {
		if (this.busy) return;
		var state = app.State;
		var transform = app.GUI.GUI_tools.tools_modules['transform'];
		if (transform && transform.object.session) {
			await transform.object.finish(true);
		}
		this.busy = true;
		try {
			while (state.action_history_index > target && state.can_undo()) {
				await state.undo_action();
			}
			while (state.action_history_index < target && state.can_redo()) {
				await state.redo_action();
			}
		}
		finally {
			this.busy = false;
			this.schedule();
		}
	}
}

export default GUI_history_class;
