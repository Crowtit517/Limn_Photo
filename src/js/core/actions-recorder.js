/*
 * Actions (Photoshop Actions panel): record adjustments, filters and menu commands,
 * then play them on another image. Saved in the browser (localStorage).
 */
import app from './../app.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const STORAGE_KEY = 'photolab_actions_v1';

// menu commands that run without a dialog and can be replayed as they are
const COMMANDS = [
	'image/auto_adjust.auto_adjust',
	'edit/transform.flip_horizontal', 'edit/transform.flip_vertical', 'edit/transform.rotate_cw',
	'edit/transform.rotate_ccw', 'edit/transform.rotate_180',
	'select/select.all', 'select/select.deselect', 'select/select.inverse', 'select/subject.subject',
	'layer/duplicate.duplicate', 'layer/merge.merge', 'layer/flatten.flatten', 'layer/new.new',
	'layer/group.group', 'image/trim.trim',
];

const COMMAND_NAMES = {
	'image/adjust.invert': '반전', 'image/adjust.desaturate': '채도 감소', 'image/auto_adjust.auto_adjust': '자동 색상',
	'edit/transform.flip_horizontal': '가로로 뒤집기', 'edit/transform.flip_vertical': '세로로 뒤집기',
	'edit/transform.rotate_cw': '90° 시계 방향 회전', 'edit/transform.rotate_ccw': '90° 시계 반대 방향 회전',
	'edit/transform.rotate_180': '180° 회전', 'select/select.all': '모두 선택', 'select/select.deselect': '선택 해제',
	'select/select.inverse': '선택 반전', 'select/subject.subject': '피사체 선택', 'layer/duplicate.duplicate': '레이어 복제',
	'layer/merge.merge': '아래 레이어와 병합', 'layer/flatten.flatten': '이미지 병합', 'layer/new.new': '새 레이어',
	'layer/group.group': '레이어 그룹화', 'image/trim.trim': '재단',
};

var instance = null;

class Actions_recorder_class {

	constructor() {
		if (instance) return instance;
		instance = this;
		this.actions = this.load();
		this.selected = this.actions.length ? 0 : -1;
		this.recording = false;
		this.playing = false;
		this.panel = null;
	}

	load() {
		try {
			var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
			if (Array.isArray(saved)) return saved;
		}
		catch (e) {
			//storage blocked or broken - start empty
		}
		return [{ name: '기본 액션', steps: [] }];
	}

	save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.actions));
		}
		catch (e) {
			alertify.error('액션을 저장하지 못했습니다 (저장 공간 부족).');
		}
	}

	// ----------------- recording -----------------

	record(step) {
		if (!this.recording || this.playing) return;
		var action = this.actions[this.selected];
		if (!action) return;
		action.steps.push(step);
		this.save();
		this.render();
	}

	record_command(module, fn, param) {
		var target = module + '.' + fn;
		if (COMMANDS.indexOf(target) < 0) return;
		this.record({ op: 'command', target: target, param: param == null ? null : param, title: COMMAND_NAMES[target] || target });
	}

	// ----------------- playback -----------------

	async play(index, quiet) {
		var action = this.actions[index];
		if (!action || !action.steps.length || this.playing) return;
		this.playing = true;
		this.render();
		var state = app.State;
		try {
			for (var i = 0; i < action.steps.length; i++) {
				this.current_step = i;
				this.render();
				await this.run_step(action.steps[i]);
				await state.wait_idle();
				await new Promise(function (resolve) { setTimeout(resolve, 80); });
				await state.wait_idle();
			}
			if (!quiet) alertify.success('액션 「' + action.name + '」 실행 완료');
		}
		catch (e) {
			console.error(e);
			alertify.error('액션 실행 중 오류: ' + (e && e.message ? e.message : e));
		}
		finally {
			this.playing = false;
			this.current_step = null;
			this.render();
		}
	}

	async run_step(step) {
		var modules = app.GUI.modules;
		if (step.op == 'command') {
			var parts = step.target.split('.');
			var module = modules[parts[0]];
			if (module && module[parts[1]]) await module[parts[1]](step.param);
			return;
		}
		if (step.op == 'adjust') {
			modules['image/adjust'].apply_params(step.kind, step.params, step.title);
			return;
		}
		if (step.op == 'camera_raw') {
			modules['image/camera_raw'].apply_params(step.params);
			return;
		}
		if (step.op == 'filter') {
			modules['image/filters'].apply_params(step.name, step.params);
		}
	}

	// ----------------- panel -----------------

	create_panel() {
		var _this = this;
		var box = document.createElement('div');
		box.className = 'ac_panel';
		box.innerHTML = '<div class="ac_list"></div>'
			+ '<div class="ac_bar">'
			+ '<button type="button" data-cmd="stop" title="실행/기록 정지">■</button>'
			+ '<button type="button" data-cmd="record" title="기록 시작">●</button>'
			+ '<button type="button" data-cmd="play" title="선택한 액션 실행">▶</button>'
			+ '<span class="ac_space"></span>'
			+ '<button type="button" data-cmd="new" title="새 액션">＋</button>'
			+ '<button type="button" data-cmd="delete" title="액션 또는 단계 삭제">🗑</button>'
			+ '</div>';
		box.addEventListener('click', function (e) {
			var button = e.target.closest('button[data-cmd]');
			if (button) {
				_this.command(button.dataset.cmd);
				return;
			}
			var row = e.target.closest('.ac_action');
			if (row) {
				_this.selected = parseInt(row.dataset.index);
				_this.selected_step = null;
				_this.render();
				return;
			}
			var step = e.target.closest('.ac_step');
			if (step) {
				_this.selected_step = parseInt(step.dataset.index);
				_this.render();
			}
		});
		box.addEventListener('dblclick', function (e) {
			var row = e.target.closest('.ac_action');
			if (!row) return;
			var action = _this.actions[parseInt(row.dataset.index)];
			var name = prompt('액션 이름', action.name);
			if (name) {
				action.name = name;
				_this.save();
				_this.render();
			}
		});
		this.panel = box;
		this.render();
		return box;
	}

	command(cmd) {
		if (cmd == 'new') {
			var name = prompt('새 액션 이름', '액션 ' + (this.actions.length + 1));
			if (!name) return;
			this.actions.push({ name: name, steps: [] });
			this.selected = this.actions.length - 1;
			this.recording = true;
			this.save();
		}
		else if (cmd == 'record') {
			if (this.selected < 0) {
				this.actions.push({ name: '액션 1', steps: [] });
				this.selected = 0;
			}
			this.recording = true;
		}
		else if (cmd == 'stop') {
			this.recording = false;
		}
		else if (cmd == 'play') {
			this.recording = false;
			this.play(this.selected);
		}
		else if (cmd == 'delete') {
			var action = this.actions[this.selected];
			if (!action) return;
			if (this.selected_step != null && action.steps[this.selected_step]) {
				action.steps.splice(this.selected_step, 1);
				this.selected_step = null;
			}
			else {
				this.actions.splice(this.selected, 1);
				this.selected = Math.min(this.selected, this.actions.length - 1);
			}
			this.save();
		}
		this.render();
	}

	render() {
		var _this = this;
		if (!this.panel) return;
		this.panel.classList.toggle('recording', this.recording);
		var list = this.panel.querySelector('.ac_list');
		var html = '';
		this.actions.forEach(function (action, index) {
			var open = index == _this.selected;
			html += '<div class="ac_action' + (open ? ' selected' : '') + '" data-index="' + index + '">'
				+ '<span class="ac_arrow">' + (open ? '▾' : '▸') + '</span>' + escape_html(action.name)
				+ '<span class="ac_count">' + action.steps.length + '</span></div>';
			if (open) {
				action.steps.forEach(function (step, s) {
					var cls = 'ac_step' + (_this.selected_step == s ? ' selected' : '') + (_this.playing && _this.current_step == s ? ' running' : '');
					html += '<div class="' + cls + '" data-index="' + s + '">' + escape_html(step.title || step.op) + '</div>';
				});
				if (_this.recording) html += '<div class="ac_hint">● 기록 중… 보정·필터·명령을 실행하세요</div>';
			}
		});
		list.innerHTML = html;
	}
}

function escape_html(text) {
	return String(text).replace(/[&<>"]/g, function (c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
	});
}

export default Actions_recorder_class;
