import app from './../../app.js';
import { Adjust_dialog } from './../../libs/live-adjust.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { new_tab_if_needed, close as close_document } from './../../core/documents.js';

const DB_NAME = 'photolab_recent';
const MAX_FILES = 10;
const MAX_BYTES = 60 * 1024 * 1024;

function open_db() {
	return new Promise(function (resolve, reject) {
		var request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = function () { request.result.createObjectStore('files', { keyPath: 'name' }); };
		request.onsuccess = function () { resolve(request.result); };
		request.onerror = function () { reject(request.error); };
	});
}

async function thumb(file) {
	try {
		var bitmap = await createImageBitmap(file);
		var s = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
		var c = document.createElement('canvas');
		c.width = Math.round(bitmap.width * s);
		c.height = Math.round(bitmap.height * s);
		c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
		return c.toDataURL('image/jpeg', 0.7);
	}
	catch (e) {
		return '';
	}
}

/**
 * keeps an opened image so File > Open Recent can bring it back
 */
export async function remember_recent(file) {
	if (!file || file.size > MAX_BYTES || !window.indexedDB) return;
	try {
		var preview = await thumb(file);
		var db = await open_db();
		var store = db.transaction('files', 'readwrite').objectStore('files');
		store.put({ name: file.name, blob: file, time: Date.now(), thumb: preview });
		var all = await new Promise(function (r) {
			var req = db.transaction('files').objectStore('files').getAll();
			req.onsuccess = function () { r(req.result); };
		});
		all.sort(function (a, b) { return b.time - a.time; });
		var tx = db.transaction('files', 'readwrite').objectStore('files');
		all.slice(MAX_FILES).forEach(function (old) { tx.delete(old.name); });
	}
	catch (e) {
		//recent list is a convenience only
	}
}

/**
 * File > Open Recent
 */
class File_recent_class {

	constructor() {
		this.dialog = new Adjust_dialog();
	}

	close() {
		close_document();
	}

	async recent() {
		var _this = this;
		var list = [];
		try {
			var db = await open_db();
			list = await new Promise(function (r) {
				var req = db.transaction('files').objectStore('files').getAll();
				req.onsuccess = function () { r(req.result); };
			});
		}
		catch (e) {
			alertify.error('최근 파일 목록을 읽을 수 없습니다.');
			return;
		}
		list.sort(function (a, b) { return b.time - a.time; });
		var body = list.length ? '<div class="rf_list">' + list.map(function (f, i) {
			return '<button type="button" class="rf_item" data-index="' + i + '"><img src="' + f.thumb + '" alt=""><span>'
				+ f.name.replace(/[<>&"]/g, '') + '</span><small>' + new Date(f.time).toLocaleString('ko-KR') + '</small></button>';
		}).join('') + '</div>' : '<div class="adj_hint">아직 연 파일이 없습니다. 파일 > 열기로 연 이미지가 여기에 나타납니다.</div>';
		this.dialog.open({
			title: '최근 파일 열기',
			body: body,
			reset: false,
			on_open: function (el) {
				el.classList.add('adj_wide');
				el.querySelectorAll('.rf_item').forEach(function (button) {
					button.addEventListener('click', function () {
						var item = list[parseInt(button.dataset.index)];
						_this.dialog.finish(false);
						_this.open_blob(item);
					});
				});
			},
			on_preview_toggle: function () {},
			on_ok: function () {},
			on_cancel: function () {},
		});
	}

	async open_blob(item) {
		await new_tab_if_needed();
		var reader = new FileReader();
		reader.onload = function () {
			app.State.do_action(new app.Actions.Bundle_action('open_image', '열기', [
				new app.Actions.Insert_layer_action({ name: item.name, type: 'image', data: reader.result }),
			]));
			remember_recent(new File([item.blob], item.name, { type: item.blob.type }));
		};
		reader.readAsDataURL(item.blob);
	}
}

export default File_recent_class;
