/*
 * Channels panel (RGB / R / G / B view, saved selections) and Paths panel (pen paths).
 * Saved selections: config.ALPHA_CHANNELS [{ name, canvas }], paths: config.PATHS [{ name, points, closed }]
 */
import app from './../../app.js';
import config from './../../config.js';
import Pixel_selection_class, { new_canvas, MODES } from './../pixel-selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { insert_shape_layer } from './../../tools/vector_shape.js';

// ----------------- paths -----------------

export function path2d(path) {
	var p = new Path2D();
	var pts = path.points;
	if (!pts.length) return p;
	p.moveTo(pts[0].x, pts[0].y);
	var seg = function (a, b) {
		var c1 = a.out || a, c2 = b.in || b;
		p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
	};
	for (var i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
	if (path.closed) {
		seg(pts[pts.length - 1], pts[0]);
		p.closePath();
	}
	return p;
}

export function commit_paths(list, selected, description) {
	var action = new app.Actions.Update_config_action({ PATHS: list });
	action.action_description = description || '패스';
	config.PATH_SELECTED = selected;
	return app.State.do_action(action);
}

function path_selection(path) {
	var canvas = new_canvas();
	var ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fill(path2d(Object.assign({}, path, { closed: true })));
	return canvas;
}

function paint_on_layer(draw, description) {
	var layer = config.layer;
	if (!layer || layer.type != 'image') {
		alertify.error('래스터 레이어를 선택하세요.');
		return;
	}
	var canvas = document.createElement('canvas');
	canvas.width = layer.width_original || layer.link.width;
	canvas.height = layer.height_original || layer.link.height;
	var ctx = canvas.getContext('2d');
	ctx.drawImage(layer.link, 0, 0);
	ctx.save();
	ctx.scale(canvas.width / layer.width, canvas.height / layer.height);
	ctx.translate(-layer.x, -layer.y);
	draw(ctx);
	ctx.restore();
	app.State.do_action(new app.Actions.Bundle_action('path_paint', description, [new app.Actions.Update_layer_image_action(canvas, layer.id)]));
}

export function create_paths_panel() {
	var box = document.createElement('div');
	box.className = 'dp_panel';
	box.innerHTML = '<div class="dp_list"></div><div class="dp_bar">'
		+ '<button type="button" data-cmd="fill" title="전경색으로 패스 칠하기">칠</button>'
		+ '<button type="button" data-cmd="stroke" title="브러시 크기로 패스에 획 긋기">획</button>'
		+ '<button type="button" data-cmd="select" title="패스를 선택 영역으로 불러오기 (Ctrl+Enter)">선택</button>'
		+ '<button type="button" data-cmd="shape" title="패스로 모양 레이어 만들기 (전경색, 직접 선택 도구 A로 편집)">모양</button>'
		+ '<span class="ac_space"></span>'
		+ '<button type="button" data-cmd="delete" title="패스 삭제">🗑</button></div>';
	var render = function () {
		var list = config.PATHS || [];
		box.querySelector('.dp_list').innerHTML = list.length ? list.map(function (p, i) {
			return '<div class="dp_row' + (i == config.PATH_SELECTED ? ' selected' : '') + '" data-index="' + i + '">✒ ' + p.name
				+ '<small>' + p.points.length + '개 점' + (p.closed ? ', 닫힘' : '') + '</small></div>';
		}).join('') : '<div class="adj_hint" style="padding:8px">펜 도구(P)로 패스를 그리세요.</div>';
	};
	var current = function () { return (config.PATHS || [])[config.PATH_SELECTED]; };
	box.addEventListener('click', function (e) {
		var row = e.target.closest('.dp_row');
		if (row) {
			config.PATH_SELECTED = parseInt(row.dataset.index);
			config.need_render = true;
			render();
			return;
		}
		var button = e.target.closest('[data-cmd]');
		var path = current();
		if (!button || !path) return;
		var cmd = button.dataset.cmd;
		if (cmd == 'select') {
			new Pixel_selection_class().combine(path_selection(path), MODES[0], '패스에서 선택');
		}
		else if (cmd == 'fill') {
			paint_on_layer(function (ctx) {
				ctx.fillStyle = config.COLOR;
				ctx.fill(path2d(Object.assign({}, path, { closed: true })));
			}, '패스 칠');
		}
		else if (cmd == 'stroke') {
			var brush = config.TOOLS.find(function (t) { return t.name == 'brush'; });
			paint_on_layer(function (ctx) {
				ctx.strokeStyle = config.COLOR;
				ctx.lineWidth = brush ? brush.attributes.size : 4;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.stroke(path2d(path));
			}, '패스 획');
		}
		else if (cmd == 'shape') {
			insert_shape_layer(path.points, path.closed, path.name);
		}
		else if (cmd == 'delete') {
			var list = (config.PATHS || []).slice();
			list.splice(config.PATH_SELECTED, 1);
			commit_paths(list, -1, '패스 삭제');
		}
	});
	box.addEventListener('dblclick', function (e) {
		var row = e.target.closest('.dp_row');
		if (!row) return;
		var list = (config.PATHS || []).slice();
		var item = Object.assign({}, list[parseInt(row.dataset.index)]);
		var name = prompt('패스 이름', item.name);
		if (!name) return;
		item.name = name;
		list[parseInt(row.dataset.index)] = item;
		commit_paths(list, parseInt(row.dataset.index), '패스 이름 바꾸기');
	});
	window.addEventListener('photolab-history', render);
	render();
	return box;
}

/**
 * selected path is drawn on the canvas (like Photoshop work path)
 */
export function draw_selected_path(ctx) {
	var path = (config.PATHS || [])[config.PATH_SELECTED];
	if (!path) return;
	ctx.save();
	ctx.lineWidth = 1.2 / (config.ZOOM || 1);
	ctx.strokeStyle = '#1e8fff';
	ctx.stroke(path2d(path));
	ctx.restore();
}

// ----------------- channels -----------------

function channel_thumb(index) {
	var c = document.createElement('canvas');
	c.width = 44;
	c.height = 32;
	if (!config.WIDTH) return c;
	var ctx = c.getContext('2d', { willReadFrequently: true });
	try {
		var full = new_canvas();
		app.Layers.convert_layers_to_canvas(full.getContext('2d'), null, false);
		var s = Math.min(c.width / full.width, c.height / full.height);
		ctx.drawImage(full, (c.width - full.width * s) / 2, (c.height - full.height * s) / 2, full.width * s, full.height * s);
		if (index >= 0) {
			var image = ctx.getImageData(0, 0, c.width, c.height);
			for (var i = 0; i < image.data.length; i += 4) {
				var v = image.data[i + index];
				image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
			}
			ctx.putImageData(image, 0, 0);
		}
	}
	catch (e) {
		//thumbnail only
	}
	return c;
}

export function commit_channels(list, description) {
	var action = new app.Actions.Update_config_action({ ALPHA_CHANNELS: list });
	action.action_description = description;
	return app.State.do_action(action);
}

export function create_channels_panel() {
	var box = document.createElement('div');
	box.className = 'dp_panel';
	box.innerHTML = '<div class="dp_list"></div><div class="dp_bar">'
		+ '<button type="button" data-cmd="load" title="채널을 선택 영역으로 불러오기">선택</button>'
		+ '<button type="button" data-cmd="save" title="선택 영역을 채널로 저장">저장</button>'
		+ '<span class="ac_space"></span>'
		+ '<button type="button" data-cmd="delete" title="채널 삭제">🗑</button></div>';
	var selected_alpha = -1;
	var rows = [['rgb', 'RGB', -1, 'Ctrl+2'], ['r', '빨강', 0, 'Ctrl+3'], ['g', '녹색', 1, 'Ctrl+4'], ['b', '파랑', 2, 'Ctrl+5']];
	var render = function () {
		var list = box.querySelector('.dp_list');
		list.innerHTML = '';
		var view = config.CHANNEL_VIEW || 'rgb';
		rows.forEach(function (r) {
			var row = document.createElement('div');
			row.className = 'dp_row' + (view == r[0] || (view == 'rgb' && r[0] != 'rgb') ? ' visible' : '') + (view == r[0] ? ' selected' : '');
			row.dataset.view = r[0];
			row.appendChild(channel_thumb(r[2]));
			var label = document.createElement('span');
			label.textContent = r[1];
			row.appendChild(label);
			var key = document.createElement('small');
			key.textContent = r[3];
			row.appendChild(key);
			list.appendChild(row);
		});
		(config.ALPHA_CHANNELS || []).forEach(function (ch, i) {
			var row = document.createElement('div');
			row.className = 'dp_row' + (i == selected_alpha ? ' selected' : '');
			row.dataset.alpha = i;
			var t = document.createElement('canvas');
			t.width = 44;
			t.height = 32;
			var tctx = t.getContext('2d');
			tctx.fillStyle = '#000';
			tctx.fillRect(0, 0, 44, 32);
			var s = Math.min(44 / ch.canvas.width, 32 / ch.canvas.height);
			var white = new_canvas(ch.canvas.width, ch.canvas.height);
			var wctx = white.getContext('2d');
			wctx.fillStyle = '#fff';
			wctx.fillRect(0, 0, white.width, white.height);
			wctx.globalCompositeOperation = 'destination-in';
			wctx.drawImage(ch.canvas, 0, 0);
			tctx.drawImage(white, (44 - ch.canvas.width * s) / 2, (32 - ch.canvas.height * s) / 2, ch.canvas.width * s, ch.canvas.height * s);
			row.appendChild(t);
			var label = document.createElement('span');
			label.textContent = ch.name;
			row.appendChild(label);
			list.appendChild(row);
		});
	};
	var set_view = function (view) {
		config.CHANNEL_VIEW = view;
		config.need_render = true;
		render();
	};
	box.addEventListener('click', function (e) {
		var row = e.target.closest('.dp_row');
		if (row && row.dataset.view) {
			set_view(row.dataset.view);
			return;
		}
		if (row && row.dataset.alpha != null) {
			selected_alpha = parseInt(row.dataset.alpha);
			//Ctrl + click = load as selection (Photoshop)
			if (e.ctrlKey || e.metaKey) load(selected_alpha);
			render();
			return;
		}
		var button = e.target.closest('[data-cmd]');
		if (!button) return;
		if (button.dataset.cmd == 'save') save_selection();
		if (button.dataset.cmd == 'load') load(selected_alpha);
		if (button.dataset.cmd == 'delete' && selected_alpha >= 0) {
			var list = (config.ALPHA_CHANNELS || []).slice();
			list.splice(selected_alpha, 1);
			selected_alpha = -1;
			commit_channels(list, '채널 삭제');
		}
	});
	var load = function (index) {
		var ch = (config.ALPHA_CHANNELS || [])[index];
		if (!ch) {
			alertify.message('불러올 채널을 고르세요.');
			return;
		}
		new Pixel_selection_class().combine(ch.canvas, MODES[0], '선택 영역 불러오기');
	};
	//Ctrl+2..5 channel view (Photoshop)
	document.addEventListener('keydown', function (e) {
		if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
		var map = { '2': 'rgb', '3': 'r', '4': 'g', '5': 'b' };
		if (!map[e.key] || (e.target && e.target.tagName == 'INPUT')) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		set_view(map[e.key]);
	}, true);
	window.addEventListener('photolab-history', function () { setTimeout(render, 200); });
	render();
	return box;
}

/**
 * Select > Save Selection
 */
export function save_selection() {
	var selection = new Pixel_selection_class();
	if (!selection.has()) {
		alertify.error('저장할 선택 영역이 없습니다.');
		return;
	}
	var list = (config.ALPHA_CHANNELS || []).slice();
	var name = prompt('채널 이름', '알파 ' + (list.length + 1));
	if (!name) return;
	list.push({ name: name, canvas: selection.mask });
	commit_channels(list, '선택 영역 저장');
}

/**
 * single channel view (applied to the main canvas after layers are drawn)
 */
export function apply_channel_view(ctx) {
	var view = config.CHANNEL_VIEW;
	if (!view || view == 'rgb') return;
	var index = { r: 0, g: 1, b: 2 }[view];
	var c = ctx.canvas;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	var image = ctx.getImageData(0, 0, c.width, c.height);
	var d = image.data;
	for (var i = 0; i < d.length; i += 4) {
		var v = d[i + index];
		d[i] = d[i + 1] = d[i + 2] = v;
	}
	ctx.putImageData(image, 0, 0);
	ctx.restore();
}
