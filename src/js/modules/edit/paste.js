import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_paste_class {

	paste() {
		alertify.error('Ctrl+V로 클립보드에서 붙여넣으세요.');
	}
}

export default Edit_paste_class;
