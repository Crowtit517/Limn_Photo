/*
 * Right click on a layer (Photoshop Layers panel context menu): commands that fit the clicked layer only
 */
import app from './../../app.js';
import config from './../../config.js';

var menu = null;

function close() {
	if (menu) menu.remove();
	menu = null;
}

function run(target, parameter) {
	close();
	app.GUI.GUI_menu.emit('select_target', target, { parameter: parameter == null ? null : parameter });
}

/**
 * [label, target, shortcut] or '-' ; only entries that make sense for this layer
 */
function items_for(layer) {
	var sorted = app.Layers.get_sorted_layers(); //top first
	var index = sorted.indexOf(layer);
	var below = index >= 0 ? sorted[index + 1] : null;
	var above = index > 0 ? sorted[index - 1] : null;
	var type = layer.type;
	var is_pixels = type == 'image';
	var is_vector = type != null && ['image', 'group', 'adjustment'].indexOf(type) < 0;
	var mask = layer._mask != null;
	var list = [
		['레이어 속성...', 'layer/rename.rename'],
		is_pixels || is_vector ? ['혼합 옵션...', 'layer/styles.blending_options'] : null,
		type == 'adjustment' ? ['조정 설정 편집...', 'layer/adjustment.edit'] : null,
		'-',
		['레이어 복제', 'layer/duplicate.duplicate', 'Ctrl+J'],
		['레이어 삭제', 'layer/delete.delete', 'Delete'],
		'-',
		type == 'group' ? ['레이어 그룹 해제', 'layer/group.ungroup', 'Shift+Ctrl+G'] : ['레이어 그룹화', 'layer/group.group', 'Ctrl+G'],
		'-',
		is_pixels && !layer.smart ? ['스마트 오브젝트로 변환', 'layer/smart.convert'] : null,
		layer.smart ? ['스마트 오브젝트 래스터화', 'layer/smart.rasterize'] : null,
		is_vector ? ['레이어 래스터화', 'layer/raster.raster'] : null,
		type == 'rectangle' || type == 'ellipse' ? ['편집 가능한 모양 레이어로 변환', 'layer/extras.convert_shape'] : null,
		'-',
		!mask && (is_pixels || is_vector || type == 'adjustment') ? ['레이어 마스크 추가', 'layer/mask.reveal_all'] : null,
		mask ? ['레이어 마스크 사용/사용 안 함', 'layer/mask.toggle'] : null,
		mask && is_pixels ? ['레이어 마스크 적용', 'layer/mask.apply'] : null,
		mask ? ['레이어 마스크 삭제', 'layer/mask.remove'] : null,
		'-',
		layer.styles && layer.styles.length ? ['레이어 스타일 지우기', 'layer/styles.clear'] : null,
		'-',
		above ? ['앞으로 가져오기', 'layer/move.up', 'Ctrl+]'] : null,
		below ? ['뒤로 보내기', 'layer/move.down', 'Ctrl+['] : null,
		'-',
		below && below.type != 'group' && type != 'group' ? ['아래 레이어와 병합', 'layer/merge.merge', 'Ctrl+E'] : null,
		sorted.length > 1 ? ['이미지 병합', 'layer/flatten.flatten'] : null,
	];
	//no empty sections, no separators at the ends or twice in a row
	var out = [];
	list.forEach(function (item) {
		if (item == null) return;
		if (item == '-' && (!out.length || out[out.length - 1] == '-')) return;
		out.push(item);
	});
	while (out.length && out[out.length - 1] == '-') out.pop();
	return out;
}

export function show_layer_menu(event, layer) {
	close();
	menu = document.createElement('div');
	menu.className = 'lp_ctx';
	items_for(layer).forEach(function (item) {
		if (item == '-') {
			menu.appendChild(Object.assign(document.createElement('div'), { className: 'lp_ctx_sep' }));
			return;
		}
		var row = document.createElement('button');
		row.type = 'button';
		row.className = 'lp_ctx_item';
		row.innerHTML = '<span>' + item[0] + '</span><span class="lp_ctx_key">' + (item[2] || '') + '</span>';
		row.addEventListener('click', function () { run(item[1]); });
		menu.appendChild(row);
	});
	document.body.appendChild(menu);
	//keep inside the window
	var w = menu.offsetWidth, h = menu.offsetHeight;
	menu.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, event.clientX)) + 'px';
	menu.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, event.clientY)) + 'px';
}

document.addEventListener('mousedown', function (e) {
	if (menu && !menu.contains(e.target)) close();
}, true);
document.addEventListener('keydown', function (e) {
	if (menu && e.key == 'Escape') close();
}, true);
window.addEventListener('blur', close);
