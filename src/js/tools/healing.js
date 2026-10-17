import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Pixel_selection_class, { new_canvas } from './../core/pixel-selection.js';
import { track_drag, view_xy } from './../core/view-nav.js';
import { heal_from_source } from './../core/heal-transfer.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Healing Brush tool (J): Alt+click sets the source, painting copies its texture and
 * matches it to the colour around the painted area (applied on release).
 * "정렬" keeps the same source offset for the next strokes.
 */
class Healing_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'healing';
		this.Selection = new Pixel_selection_class();
		this.source = null;
		this.offset = null;
		this.stroke = null;
		this.busy = false;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0 || _this.busy) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			var p = _this.to_doc(e);
			if (e.altKey) {
				_this.source = p;
				_this.offset = null;
				config.need_render = true;
				return;
			}
			if (!_this.source) {
				alertify.error('Alt+클릭으로 복구 원본 위치를 먼저 지정하세요.');
				return;
			}
			_this.paint(e, p);
		});
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || _this.stroke) return;
			var mouse = _this.get_mouse_info(e);
			_this.show_mouse_cursor(mouse.x, mouse.y, _this.getParams().size, 'circle');
		});
	}

	to_doc(e) {
		var canvas = document.getElementById('canvas_minipaint');
		var rect = canvas.getBoundingClientRect();
		return window.Layers.get_world_coords(...view_xy(e));
	}

	paint(e, start) {
		var _this = this;
		var params = this.getParams();
		var size = Math.max(1, params.size);
		if (!this.offset || !params.aligned) {
			this.offset = { x: this.source.x - start.x, y: this.source.y - start.y };
		}
		var mask = new_canvas();
		var ctx = mask.getContext('2d');
		ctx.strokeStyle = '#ffffff';
		ctx.fillStyle = '#ffffff';
		ctx.lineWidth = size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		var last = start;
		ctx.beginPath();
		ctx.arc(last.x, last.y, size / 2, 0, Math.PI * 2);
		ctx.fill();
		this.stroke = mask;
		this.cursor = start;
		config.need_render = true;
		track_drag(e, function (dx, dy, ev) {
			var p = _this.to_doc(ev);
			ctx.beginPath();
			ctx.moveTo(last.x, last.y);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			last = p;
			_this.cursor = p;
			config.need_render = true;
		}, function () {
			_this.apply(mask);
		});
	}

	async apply(mask) {
		if (this.Selection.has()) {
			var ctx = mask.getContext('2d');
			ctx.globalCompositeOperation = 'destination-in';
			ctx.drawImage(this.Selection.mask, 0, 0);
		}
		this.busy = true;
		try {
			await heal_from_source(config.layer, mask, this.offset.x, this.offset.y, '복구 브러시');
		}
		finally {
			this.busy = false;
			this.stroke = null;
			config.need_render = true;
		}
	}

	render_overlay(ctx) {
		if (config.TOOL.name != this.name) return;
		var zoom = config.ZOOM || 1;
		ctx.save();
		if (this.stroke) {
			ctx.globalAlpha = 0.35;
			ctx.drawImage(this.stroke, 0, 0);
			ctx.globalAlpha = 1;
		}
		//source crosshair
		var src = this.source;
		if (src && this.stroke && this.offset && this.cursor) {
			src = { x: this.cursor.x + this.offset.x, y: this.cursor.y + this.offset.y };
		}
		if (src) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1.5 / zoom;
			var r = 6 / zoom;
			ctx.beginPath();
			ctx.moveTo(src.x - r, src.y);
			ctx.lineTo(src.x + r, src.y);
			ctx.moveTo(src.x, src.y - r);
			ctx.lineTo(src.x, src.y + r);
			ctx.stroke();
		}
		ctx.restore();
	}
}

export default Healing_class;
