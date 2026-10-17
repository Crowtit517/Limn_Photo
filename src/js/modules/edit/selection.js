import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_selection_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
	}

	select_all() {
		if (config.layer.type != 'image') {
			alertify.error('이미지 레이어에서만 사용할 수 있습니다. 먼저 레이어를 래스터화하세요.');
			return;
		}
		this.Selection.select_all();
	}

	delete() {
		this.Selection.delete_selection();
	}
}

export default Edit_selection_class;
