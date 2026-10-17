import app from './../../app.js';
import config from './../../config.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import Actions_recorder_class from './../../core/actions-recorder.js';
import { new_tab, close as close_document } from './../../core/documents.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * File > Automate > Batch: run an action on every image of a folder and save results to another folder
 */
class File_batch_class {

	constructor() {
		this.dialog = new Adjust_dialog();
	}

	batch() {
		var _this = this;
		if (!window.showDirectoryPicker) {
			alertify.error('이 환경에서는 폴더를 고를 수 없습니다. (Chrome / Edge / PC 앱에서 지원)');
			return;
		}
		var recorder = new Actions_recorder_class();
		var actions = recorder.actions.filter(function (a) { return a.steps.length; });
		if (!actions.length) {
			alertify.error('먼저 액션 패널에서 액션을 기록하세요.');
			return;
		}
		var source = null, target = null;
		var root = null;
		this.dialog.open({
			title: '일괄 처리',
			reset: false,
			body: '<div class="adj_row"><label>액션</label><select class="adj_select" id="bt_action">'
				+ actions.map(function (a, i) { return '<option value="' + i + '">' + a.name + ' (' + a.steps.length + '단계)</option>'; }).join('') + '</select></div>'
				+ '<div class="adj_row"><label>원본 폴더</label><button type="button" class="adj_btn" id="bt_src">선택...</button><span class="adj_hint" id="bt_src_name"></span></div>'
				+ '<div class="adj_row"><label>저장 폴더</label><button type="button" class="adj_btn" id="bt_dst">선택...</button><span class="adj_hint" id="bt_dst_name"></span></div>'
				+ '<div class="adj_row"><label>형식</label><select class="adj_select" id="bt_format"><option value="jpg">JPEG</option><option value="png">PNG</option></select>'
				+ '<label>품질</label><input type="number" class="adj_num" id="bt_quality" value="92" min="10" max="100"></div>'
				+ '<div class="adj_hint" id="bt_progress"></div>',
			on_open: function (el) {
				root = el;
				el.querySelector('#bt_src').addEventListener('click', async function () {
					try {
						source = await window.showDirectoryPicker({ mode: 'read' });
						el.querySelector('#bt_src_name').textContent = source.name;
					}
					catch (e) { /* cancelled */ }
				});
				el.querySelector('#bt_dst').addEventListener('click', async function () {
					try {
						target = await window.showDirectoryPicker({ mode: 'readwrite' });
						el.querySelector('#bt_dst_name').textContent = target.name;
					}
					catch (e) { /* cancelled */ }
				});
			},
			on_preview_toggle: function () {},
			on_ok: function () {
				if (!source || !target) {
					alertify.error('원본 폴더와 저장 폴더를 고르세요.');
					return;
				}
				var action_index = recorder.actions.indexOf(actions[parseInt(root.querySelector('#bt_action').value)]);
				var format = root.querySelector('#bt_format').value;
				var quality = Math.max(10, Math.min(100, parseInt(root.querySelector('#bt_quality').value) || 92)) / 100;
				_this.run(source, target, action_index, format, quality);
			},
			on_cancel: function () {},
		});
	}

	async run(source, target, action_index, format, quality) {
		var recorder = new Actions_recorder_class();
		var files = [];
		for await (var entry of source.values()) {
			if (entry.kind == 'file' && /\.(jpe?g|png|webp|bmp|gif)$/i.test(entry.name)) files.push(entry);
		}
		if (!files.length) {
			alertify.error('폴더에 이미지가 없습니다.');
			return;
		}
		var done = 0;
		alertify.message('일괄 처리 시작: ' + files.length + '개');
		for (var file_entry of files) {
			try {
				var file = await file_entry.getFile();
				await new_tab();
				var url = URL.createObjectURL(file);
				await new Promise(function (resolve) {
					App_open(url, file.name, resolve);
				});
				URL.revokeObjectURL(url);
				await recorder.play(action_index, true);
				var canvas = document.createElement('canvas');
				canvas.width = config.WIDTH;
				canvas.height = config.HEIGHT;
				app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
				var type = format == 'png' ? 'image/png' : 'image/jpeg';
				var blob = await new Promise(function (r) { canvas.toBlob(r, type, quality); });
				var name = file.name.replace(/\.[^.]+$/, '') + (format == 'png' ? '.png' : '.jpg');
				var handle = await target.getFileHandle(name, { create: true });
				var writable = await handle.createWritable();
				await writable.write(blob);
				await writable.close();
				done++;
				await close_document();
			}
			catch (e) {
				console.error(e);
				alertify.error(file_entry.name + ' 처리 실패: ' + (e && e.message ? e.message : e));
			}
		}
		alertify.success('일괄 처리 완료: ' + done + ' / ' + files.length + '개 저장');
	}
}

/**
 * opens an image url into the current (fresh) document and waits until it is shown
 */
function App_open(url, name, done) {
	var img = new Image();
	img.onload = async function () {
		await app.State.do_action(new app.Actions.Bundle_action('open_image', '열기', [
			new app.Actions.Insert_layer_action({ name: name, type: 'image', link: img, width: img.width, height: img.height, width_original: img.width, height_original: img.height }),
			new app.Actions.Autoresize_canvas_action(img.width, img.height, null, true, true),
		]));
		setTimeout(done, 200);
	};
	img.onerror = function () { done(); };
	img.src = url;
}

export default File_batch_class;
