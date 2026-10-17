import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';

class Help_about_class {

	constructor() {
		this.POP = new Dialog_class();
	}

	//about
	about() {
		var email = 'www.viliusl@gmail.com';	
		
		var settings = {
			title: 'About',
			params: [
				{title: "", html: '<img style="width:64px;" class="about-logo" alt="" src="images/brand/limn-128.png" />'},
				{title: "Name:", html: '<span class="about-name">Limn</span>'},
				{title: "Version:", value: VERSION},
				{title: "Description:", value: "개인용 이미지 편집기"},
				{title: "기반:", html: 'miniPaint (MIT License) by ViliusL - <a href="https://github.com/viliusle/miniPaint">github.com/viliusle/miniPaint</a>'},
				{title: "원작자 Email:", html: '<a href="mailto:' + email + '">' + email + '</a>'},
			],
		};
		this.POP.show(settings);
	}

}

export default Help_about_class;
