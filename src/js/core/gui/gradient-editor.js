/*
 * Gradient editor (Photoshop): presets and colour stops for the Gradient tool.
 * Stops: [{ pos: 0..1, color: '#rrggbb', alpha: 0..1 }]
 */
import config from './../../config.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';

export const GRADIENT_PRESETS = [
	['전경색 → 배경색', null],
	['전경색 → 투명', null],
	['검정 → 흰색', [[0, '#000000', 1], [1, '#ffffff', 1]]],
	['스펙트럼', [[0, '#ff0000', 1], [0.17, '#ffff00', 1], [0.33, '#00ff00', 1], [0.5, '#00ffff', 1], [0.67, '#0000ff', 1], [0.83, '#ff00ff', 1], [1, '#ff0000', 1]]],
	['주황, 노랑, 주황', [[0, '#ff6e02', 1], [0.5, '#ffff00', 1], [1, '#ff6d00', 1]]],
	['파랑, 빨강, 노랑', [[0, '#0a00b2', 1], [0.5, '#ff0000', 1], [1, '#fffc00', 1]]],
	['구리', [[0, '#97461a', 1], [0.3, '#fbd8c5', 1], [0.83, '#6c2e16', 1], [1, '#efdbcd', 1]]],
	['노을', [[0, '#1b1440', 1], [0.45, '#d6336c', 1], [0.75, '#f59f00', 1], [1, '#ffe066', 1]]],
];

function to_stops(list) {
	return list.map(function (s) { return { pos: s[0], color: s[1], alpha: s[2] }; });
}

export function preset_stops(index) {
	var preset = GRADIENT_PRESETS[index];
	if (!preset) return null;
	if (index == 0) return to_stops([[0, config.COLOR, 1], [1, config.BG_COLOR || '#ffffff', 1]]);
	if (index == 1) return to_stops([[0, config.COLOR, 1], [1, config.COLOR, 0]]);
	return to_stops(preset[1]);
}

export function css_gradient(stops) {
	return 'linear-gradient(to right,' + stops.map(function (s) {
		var h = s.color.replace('#', '');
		var rgb = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
		return 'rgba(' + rgb.join(',') + ',' + s.alpha + ') ' + Math.round(s.pos * 100) + '%';
	}).join(',') + ')';
}

export class Gradient_editor {

	constructor() {
		this.dialog = new Adjust_dialog();
	}

	open(stops, on_ok) {
		var _this = this;
		stops = JSON.parse(JSON.stringify(stops || preset_stops(0)));
		var selected = 0;
		var root = null;
		var body = '<div class="ge_presets">' + GRADIENT_PRESETS.map(function (p, i) {
			return '<button type="button" class="ge_preset" data-index="' + i + '" title="' + p[0] + '" style="background:' + css_gradient(preset_stops(i)) + '"></button>';
		}).join('') + '</div>'
			+ '<div class="ge_bar_wrap"><div class="ge_bar"></div><div class="ge_stops"></div></div>'
			+ '<div class="adj_hint">막대 아래를 클릭하면 색상 정지점 추가 · 정지점을 끌어 위치 변경</div>'
			+ '<div class="adj_row"><label>색상</label><input type="color" id="ge_color"></div>'
			+ '<div class="adj_row"><label>불투명도(%)</label><input type="range" id="ge_alpha" min="0" max="100"></div>'
			+ '<div class="adj_row"><label>위치(%)</label><input type="range" id="ge_pos" min="0" max="100"></div>'
			+ '<div class="adj_row"><button type="button" class="adj_btn" id="ge_delete">정지점 삭제</button></div>';
		var draw = function () {
			stops.sort(function (a, b) { return a.pos - b.pos; });
			root.querySelector('.ge_bar').style.background = css_gradient(stops) + ', repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0 / 12px 12px';
			var box = root.querySelector('.ge_stops');
			box.innerHTML = stops.map(function (s, i) {
				return '<span class="ge_stop' + (i == selected ? ' selected' : '') + '" data-index="' + i + '" style="left:' + (s.pos * 100) + '%;background:' + s.color + '"></span>';
			}).join('');
			var s = stops[selected];
			if (s) {
				root.querySelector('#ge_color').value = s.color;
				root.querySelector('#ge_alpha').value = Math.round(s.alpha * 100);
				root.querySelector('#ge_pos').value = Math.round(s.pos * 100);
			}
		};
		this.dialog.open({
			title: '그레이디언트 편집기',
			body: body,
			reset: false,
			on_open: function (el) {
				root = el;
				el.classList.add('adj_wide');
				el.querySelectorAll('.ge_preset').forEach(function (b) {
					b.addEventListener('click', function () {
						stops = preset_stops(parseInt(b.dataset.index));
						selected = 0;
						draw();
					});
				});
				var wrap = el.querySelector('.ge_stops');
				wrap.addEventListener('mousedown', function (e) {
					var rect = wrap.getBoundingClientRect();
					var stop_el = e.target.closest('.ge_stop');
					if (stop_el) {
						var current = stops[parseInt(stop_el.dataset.index)];
						selected = parseInt(stop_el.dataset.index);
						var move = function (ev) {
							current.pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
							draw();
							selected = stops.indexOf(current);
						};
						var up = function () {
							document.removeEventListener('mousemove', move);
							document.removeEventListener('mouseup', up);
						};
						document.addEventListener('mousemove', move);
						document.addEventListener('mouseup', up);
					}
					else {
						var pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
						var base = stops[selected] || stops[0];
						var added = { pos: pos, color: base.color, alpha: 1 };
						stops.push(added);
						stops.sort(function (a, b) { return a.pos - b.pos; });
						selected = stops.indexOf(added);
					}
					draw();
				});
				el.querySelector('#ge_color').addEventListener('input', function () { stops[selected].color = this.value; draw(); });
				el.querySelector('#ge_alpha').addEventListener('input', function () { stops[selected].alpha = this.value / 100; draw(); });
				el.querySelector('#ge_pos').addEventListener('input', function () {
					var current = stops[selected];
					current.pos = this.value / 100;
					draw();
					selected = stops.indexOf(current);
				});
				el.querySelector('#ge_delete').addEventListener('click', function () {
					if (stops.length <= 2) return;
					stops.splice(selected, 1);
					selected = 0;
					draw();
				});
				draw();
			},
			on_preview_toggle: function () {},
			on_ok: function () { on_ok(stops); },
			on_cancel: function () {},
		});
	}
}
