import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * group of a layer (or null)
 */
export function parent_group(layer) {
	if (!layer || !layer.parent_id) return null;
	return config.layers.find(function (l) { return l.id == layer.parent_id && l.type == 'group'; }) || null;
}

/**
 * visibility and opacity a layer gets from its groups
 */
export function group_state(layer) {
	var visible = true, opacity = 1;
	var group = parent_group(layer);
	var guard = 0;
	while (group && guard++ < 20) {
		if (group.visible === false) visible = false;
		opacity *= (group.opacity == null ? 100 : group.opacity) / 100;
		group = parent_group(group);
	}
	return { visible: visible, opacity: opacity };
}

/**
 * Layer > Group Layers (Ctrl+G), Ungroup Layers (Shift+Ctrl+G), New Group
 */
class Layer_group_class {

	next_name() {
		var n = 1;
		var names = config.layers.map(function (l) { return l.name; });
		while (names.indexOf('그룹 ' + n) >= 0) n++;
		return '그룹 ' + n;
	}

	group_settings() {
		return {
			type: 'group',
			name: this.next_name(),
			x: 0,
			y: 0,
			width: config.WIDTH,
			height: config.HEIGHT,
			width_original: config.WIDTH,
			height_original: config.HEIGHT,
			hide_selection_if_active: true,
			params: {},
		};
	}

	/**
	 * inserted group goes right above the reference layer
	 */
	insert_actions(reference) {
		var actions = [];
		var group_id = app.Layers.auto_increment;
		actions.push(new app.Actions.Insert_layer_action(this.group_settings(), false));
		if (reference) {
			var above = config.layers.filter(function (l) { return l.order > reference.order; }).length;
			for (var i = 0; i < above; i++) {
				actions.push(new app.Actions.Reorder_layer_action(group_id, -1));
			}
		}
		return { actions: actions, group_id: group_id };
	}

	new_group() {
		var made = this.insert_actions(config.layer);
		if (config.layer && config.layer.parent_id) {
			made.actions.push(new app.Actions.Update_layer_action(made.group_id, { parent_id: config.layer.parent_id }));
		}
		app.State.do_action(new app.Actions.Bundle_action('new_group', '새 그룹', made.actions));
	}

	/**
	 * Ctrl+G: put active layer into a new group
	 */
	group() {
		var layer = config.layer;
		if (!layer) return;
		if (layer.type == null && config.layers.length == 1) {
			alertify.error('빈 레이어는 그룹으로 묶을 수 없습니다.');
			return;
		}
		var made = this.insert_actions(layer);
		if (layer.parent_id) {
			made.actions.push(new app.Actions.Update_layer_action(made.group_id, { parent_id: layer.parent_id }));
		}
		made.actions.push(new app.Actions.Update_layer_action(layer.id, { parent_id: made.group_id }));
		app.State.do_action(new app.Actions.Bundle_action('group_layers', '레이어 그룹화', made.actions));
	}

	/**
	 * Shift+Ctrl+G: dissolve active group (or take active layer out of its group)
	 */
	ungroup() {
		var layer = config.layer;
		if (!layer) return;
		var actions = [];
		if (layer.type == 'group') {
			var outer = layer.parent_id || 0;
			config.layers.forEach(function (l) {
				if (l.parent_id == layer.id) actions.push(new app.Actions.Update_layer_action(l.id, { parent_id: outer }));
			});
			actions.push(new app.Actions.Delete_layer_action(layer.id));
		}
		else if (layer.parent_id) {
			var group = parent_group(layer);
			actions.push(new app.Actions.Update_layer_action(layer.id, { parent_id: group ? group.parent_id || 0 : 0 }));
		}
		else {
			return;
		}
		app.State.do_action(new app.Actions.Bundle_action('ungroup_layers', '레이어 그룹 해제', actions));
	}
}

export default Layer_group_class;
