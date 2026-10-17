import app from './../../app.js';
import config from './../../config.js';
import Pixel_selection_class, { new_canvas } from './../../core/pixel-selection.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { heal_layer } from './../../core/ai-apply.js';

/**
 * Select menu and selection based edit commands, Photoshop style
 */
class Select_select_class {

	constructor() {
		this.Selection = new Pixel_selection_class();
		this.POP = new Dialog_class();
	}

	all() {
		this.Selection.select_all();
	}

	deselect() {
		this.Selection.deselect();
	}

	reselect() {
		this.Selection.reselect();
	}

	inverse() {
		this.Selection.invert();
	}

	ask_pixels(title, label, callback) {
		if (!this.Selection.has()) {
			alertify.error('선택 영역이 없습니다.');
			return;
		}
		this.POP.show({
			title: title,
			params: [
				{ name: 'pixels', title: label, value: 5, range: [1, 250] },
			],
			on_finish: function (params) {
				callback(parseFloat(params.pixels));
			},
		});
	}

	feather() {
		var _this = this;
		this.ask_pixels('선택 영역 페더', '페더 반경 (픽셀):', function (v) { _this.Selection.feather(v); });
	}

	expand() {
		var _this = this;
		this.ask_pixels('선택 영역 확대', '확대량 (픽셀):', function (v) { _this.Selection.grow(v); });
	}

	contract() {
		var _this = this;
		this.ask_pixels('선택 영역 축소', '축소량 (픽셀):', function (v) { _this.Selection.grow(-v); });
	}

	// ---------- pixel commands ----------

	/**
	 * selected pixels of active layer as document-sized canvas (layer mask not applied)
	 */
	selected_pixels(layer) {
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		app.Layers.render_object(ctx, Object.assign({}, layer, { visible: true, _mask: null }));
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(this.Selection.mask, 0, 0);
		return canvas;
	}

	check_image_layer() {
		var layer = config.layer;
		if (!layer || layer.type != 'image') {
			alertify.error('래스터 레이어를 선택하세요.');
			return null;
		}
		return layer;
	}

	/**
	 * actions that remove selected pixels from layer (keeps document-sized raster)
	 */
	clear_actions(layer) {
		var w = config.WIDTH, h = config.HEIGHT;
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		app.Layers.render_object(ctx, Object.assign({}, layer, { visible: true, _mask: null }));
		//no selection = the whole layer (e.g. Edit > Fill without a selection)
		if (this.Selection.has()) {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.drawImage(this.Selection.mask, 0, 0);
		}
		var actions = [];
		if (layer.x != 0 || layer.y != 0 || layer.width != w || layer.height != h || layer.rotate) {
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0,
			}));
		}
		actions.push(new app.Actions.Update_layer_image_action(canvas, layer.id));
		return actions;
	}

	/**
	 * Delete / Backspace: clears selected pixels
	 */
	clear() {
		if (!this.Selection.has()) return false;
		var layer = this.check_image_layer();
		if (!layer) return true;
		app.State.do_action(new app.Actions.Bundle_action('clear_selection', '지우기', this.clear_actions(layer)));
		return true;
	}

	/**
	 * Ctrl+J with selection: copy selected pixels to new layer (Ctrl+Shift+J: cut)
	 */
	layer_via(cut) {
		var layer = this.check_image_layer();
		if (!layer || !this.Selection.has()) return;
		var pixels = this.selected_pixels(layer);
		var actions = [];
		if (cut) {
			actions = actions.concat(this.clear_actions(layer));
		}
		actions.push(new app.Actions.Insert_layer_action({
			name: layer.name + (cut ? ' 잘라내기' : ' 복사'),
			type: 'image',
			data: pixels.toDataURL('image/png'),
			x: 0, y: 0,
			width: config.WIDTH, height: config.HEIGHT,
			width_original: config.WIDTH, height_original: config.HEIGHT,
		}, false));
		app.State.do_action(new app.Actions.Bundle_action('layer_via', cut ? '잘라낸 레이어' : '복사한 레이어', actions));
	}

	layer_via_copy() {
		this.layer_via(false);
	}

	layer_via_cut() {
		this.layer_via(true);
	}

	/**
	 * Ctrl+C / Ctrl+X with selection: selected pixels to clipboard (cropped to selection bounds)
	 */
	async copy(cut) {
		var layer = this.check_image_layer();
		if (!layer || !this.Selection.has()) return;
		var bounds = this.Selection.get_bounds();
		if (!bounds) return;
		var pixels = this.selected_pixels(layer);
		var out = new_canvas(bounds.width, bounds.height);
		out.getContext('2d').drawImage(pixels, -bounds.x, -bounds.y);
		try {
			var blob = await new Promise(function (resolve) { out.toBlob(resolve, 'image/png'); });
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			alertify.success(cut ? '잘라내서 클립보드에 복사했습니다.' : '클립보드에 복사했습니다.');
		}
		catch (e) {
			alertify.error('클립보드에 쓸 수 없습니다.');
			return;
		}
		if (cut) {
			app.State.do_action(new app.Actions.Bundle_action('cut', '잘라내기', this.clear_actions(layer)));
		}
	}

	cut() {
		return this.copy(true);
	}

	/**
	 * Edit > Content-Aware Fill: AI fills the selection from its surroundings
	 */
	async content_aware_fill() {
		if (!this.Selection.has()) {
			alertify.error('채울 영역을 먼저 선택하세요.');
			return;
		}
		var mask = this.Selection.copy(this.Selection.mask);
		await heal_layer(mask, false, '내용 인식 채우기', 4);
	}

	/**
	 * Edit > Fill (Shift+F5 style): fills selection with foreground color
	 */
	fill_foreground() {
		var layer = config.layer;
		if (!layer || (layer.type != 'image' && layer.type != null)) {
			alertify.error('래스터 레이어를 선택하세요.');
			return;
		}
		var w = config.WIDTH, h = config.HEIGHT;
		var color = new_canvas();
		var cctx = color.getContext('2d');
		cctx.fillStyle = config.COLOR;
		cctx.fillRect(0, 0, w, h);
		if (this.Selection.has()) {
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(this.Selection.mask, 0, 0);
		}
		var canvas = new_canvas();
		var ctx = canvas.getContext('2d');
		if (layer.type == 'image') {
			app.Layers.render_object(ctx, Object.assign({}, layer, { visible: true, _mask: null }));
		}
		ctx.drawImage(color, 0, 0);
		if (layer.type == null) {
			app.State.do_action(new app.Actions.Bundle_action('fill', '칠', [
				new app.Actions.Delete_layer_action(layer.id, true),
				new app.Actions.Insert_layer_action({
					name: layer.name, type: 'image', data: canvas.toDataURL('image/png'),
					x: 0, y: 0, width: w, height: h, width_original: w, height_original: h,
				}, false),
			]));
			return;
		}
		var actions = this.clear_actions(layer).slice(0, -1);
		actions.push(new app.Actions.Update_layer_image_action(canvas, layer.id));
		app.State.do_action(new app.Actions.Bundle_action('fill', '칠', actions));
	}

	/**
	 * Image > Crop: crops document to selection bounds
	 */
	crop() {
		var bounds = this.Selection.get_bounds();
		if (!bounds) {
			alertify.error('선택 영역이 없습니다.');
			return;
		}
		var actions = [];
		for (var layer of config.layers) {
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: layer.x - bounds.x,
				y: layer.y - bounds.y,
			}));
		}
		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: bounds.width, HEIGHT: bounds.height }),
			new app.Actions.Prepare_canvas_action('do')
		);
		var _this = this;
		app.State.do_action(new app.Actions.Bundle_action('crop_selection', '자르기', actions)).then(function () {
			_this.Selection.apply(null);
		});
	}
}

export default Select_select_class;
