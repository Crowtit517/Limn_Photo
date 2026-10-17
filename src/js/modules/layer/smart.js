import app from './../../app.js';
import config from './../../config.js';
import { to_smart_object, smart_actions, is_smart } from './../../core/smart-object.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Layer > Smart Objects
 */
class Layer_smart_class {

	convert() {
		var layer = config.layer;
		if (!layer || layer.type != 'image') {
			alertify.error('픽셀 레이어만 스마트 오브젝트로 변환할 수 있습니다.');
			return;
		}
		if (layer.smart) {
			alertify.message('이미 스마트 오브젝트입니다.');
			return;
		}
		to_smart_object(layer);
	}

	rasterize() {
		var layer = config.layer;
		if (!is_smart(layer)) return;
		var action = new app.Actions.Update_layer_action(layer.id, { smart: null });
		action.action_description = '스마트 오브젝트 래스터화';
		app.State.do_action(action);
	}

	toggle_filter(layer, index) {
		var filters = layer.smart.filters.map(function (f, i) { return i == index ? Object.assign({}, f, { enabled: f.enabled === false }) : f; });
		app.State.do_action(new app.Actions.Bundle_action('smart_filter', '고급 필터 표시/숨기기', smart_actions(layer, filters)));
	}

	delete_filter(layer, index) {
		var filters = layer.smart.filters.filter(function (f, i) { return i != index; });
		app.State.do_action(new app.Actions.Bundle_action('smart_filter', '고급 필터 삭제', smart_actions(layer, filters)));
	}

	/**
	 * double click a smart filter: adjustment dialogs open with their settings
	 */
	edit_filter(layer, index) {
		var step = layer.smart.filters[index];
		if (step.op != 'adjust' || !step.params || !Object.keys(step.params).length) {
			alertify.message('이 고급 필터는 켜기/끄기와 삭제만 할 수 있습니다.');
			return;
		}
		var original = layer.smart.filters;
		app.GUI.modules['image/adjust'].edit_layer(step.kind, {
			params: step.params,
			source: (function () {
				var c = document.createElement('canvas');
				c.width = layer.smart.source.width;
				c.height = layer.smart.source.height;
				var ctx = c.getContext('2d', { willReadFrequently: true });
				ctx.drawImage(layer.smart.source, 0, 0);
				return ctx.getImageData(0, 0, c.width, c.height).data;
			})(),
			on_change: function () {},
			on_ok: function (params) {
				var filters = original.map(function (f, i) { return i == index ? Object.assign({}, f, { params: params }) : f; });
				app.State.do_action(new app.Actions.Bundle_action('smart_filter', '고급 필터 수정', smart_actions(layer, filters)));
			},
			on_cancel: function () {},
		});
	}
}

export default Layer_smart_class;
