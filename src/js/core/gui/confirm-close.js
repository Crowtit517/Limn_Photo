/*
 * "Save changes before closing?" with 저장 / 저장 안 함 / 취소 (like Windows apps)
 * resolves 'save' | 'discard' | 'cancel'
 */
export function ask_save(name) {
	return new Promise(function (resolve) {
		var back = document.createElement('div');
		back.className = 'cc_back';
		back.innerHTML = '<div class="cc_box" role="dialog" aria-modal="true">'
			+ '<div class="cc_title">Limn</div>'
			+ '<div class="cc_text"></div>'
			+ '<div class="cc_buttons">'
			+ '<button type="button" class="cc_btn primary" data-r="save">저장</button>'
			+ '<button type="button" class="cc_btn" data-r="discard">저장 안 함</button>'
			+ '<button type="button" class="cc_btn" data-r="cancel">취소</button>'
			+ '</div></div>';
		back.querySelector('.cc_text').textContent = '"' + name + '"의 변경 내용을 닫기 전에 저장할까요?';
		document.body.appendChild(back);
		var done = function (result) {
			document.removeEventListener('keydown', key, true);
			back.remove();
			resolve(result);
		};
		var key = function (e) {
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done('cancel'); }
			else if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); done('save'); }
		};
		document.addEventListener('keydown', key, true);
		back.addEventListener('click', function (e) {
			var button = e.target.closest('[data-r]');
			if (button) done(button.dataset.r);
		});
		back.querySelector('[data-r="save"]').focus();
	});
}
