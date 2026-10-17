/*
 * Layer locks (Photoshop): pixels locked = no painting / retouching / filters,
 * position locked = no moving / transforming, all = both.
 */
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const PIXEL_TOOLS = [
	'brush', 'pencil', 'erase', 'magic_erase', 'clone', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge',
	'fill', 'gradient', 'spot_heal', 'healing', 'red_eye', 'desaturate', 'bulge_pinch',
	'rectangle', 'ellipse', 'line', 'triangle', 'polygon', 'shape',
];
const POSITION_TOOLS = ['select', 'transform'];

export function is_locked(layer, kind) {
	var locks = layer && layer.locks;
	if (!locks) return false;
	return !!(locks.all || locks[kind]);
}

/**
 * true (and a message) if the active layer may not be changed this way
 */
export function blocked(kind) {
	if (!is_locked(config.layer, kind)) return false;
	alertify.error(kind == 'position' ? '레이어 위치가 잠겨 있습니다.' : '레이어 픽셀이 잠겨 있습니다.');
	return true;
}

export function init_layer_locks() {
	//capture phase: stop the tool before it starts
	document.addEventListener('mousedown', function (e) {
		if (e.button != 0 || !config.TOOL || !e.target.closest || !e.target.closest('#main_wrapper')) return;
		var tool = config.TOOL.name;
		var kind = PIXEL_TOOLS.indexOf(tool) >= 0 ? 'pixels' : POSITION_TOOLS.indexOf(tool) >= 0 ? 'position' : null;
		if (!kind || e.altKey) return;
		if (kind == 'pixels' && config.layer && config.layer.smart) {
			alertify.error('스마트 오브젝트는 직접 칠할 수 없습니다. 레이어 > 스마트 오브젝트 > 스마트 오브젝트 래스터화 후 칠하세요.');
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
		if (blocked(kind)) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);
}
