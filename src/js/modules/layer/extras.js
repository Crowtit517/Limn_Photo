import app from './../../app.js';
import config from './../../config.js';
import { render_all_doc } from './../../core/ai-apply.js';
import { make_surface } from './../../core/layer-surface.js';
import { convert_to_shape } from './../../tools/vector_shape.js';

/**
 * Layer extras: Stamp Visible (Ctrl+Alt+Shift+E)
 */
class Layer_extras_class {

	/**
	 * rectangle / ellipse -> point editable shape layer (Direct Selection tool)
	 */
	convert_shape() {
		convert_to_shape(config.layer);
	}

	/**
	 * new layer above the active one with everything visible merged
	 */
	async stamp_visible() {
		if (!config.WIDTH) return;
		var merged = render_all_doc();
		var active = config.layer;
		var new_id = app.Layers.auto_increment;
		var actions = [new app.Actions.Insert_layer_action({
			type: 'image',
			name: '병합된 레이어',
			link: make_surface(merged),
			x: 0,
			y: 0,
			width: config.WIDTH,
			height: config.HEIGHT,
			width_original: config.WIDTH,
			height_original: config.HEIGHT,
		}, false)];
		if (active) {
			var above = config.layers.filter(function (l) { return l.order > active.order; }).length;
			for (var i = 0; i < above; i++) actions.push(new app.Actions.Reorder_layer_action(new_id, -1));
		}
		await app.State.do_action(new app.Actions.Bundle_action('stamp_visible', '도장 찍기 (보이는 레이어 병합)', actions));
	}
}

export default Layer_extras_class;
