import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Pixel_selection_class, { new_canvas } from './../core/pixel-selection.js';
import { track_drag, view_xy } from './../core/view-nav.js';
import { heal_layer, dilate } from './../core/ai-apply.js';

/**
 * Spot Healing Brush tool (J): paint over a spot, on release AI fills the painted area
 * from its surroundings (content-aware). Works inside the selection only, if there is one.
 */
class Spot_heal_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'spot_heal';
		this.Selection = new Pixel_selection_class();
		this.stroke = null;
		this.busy = false;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (e) {
			if (config.TOOL.name != _this.name || e.button != 0 || _this.busy) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			e.preventDefault();
			_this.paint(e);
		});
		document.addEventListener('mousemove', function (e) {
			if (config.TOOL.name != _this.name || _this.stroke) return;
			var mouse = _this.get_mouse_info(e);
			_this.show_mouse_cursor(mouse.x, mouse.y, _this.getParams().size, 'circle');
		});
	}

	paint(e) {
		var _this = this;
		var params = this.getParams();
		var size = Math.max(1, params.size);
		var canvas = document.getElementById('canvas_minipaint');
		var rect = canvas.getBoundingClientRect();
		var to_doc = function (ev) {
			return window.Layers.get_world_coords(...view_xy(ev));
		};
		var mask = new_canvas();
		var ctx = mask.getContext('2d');
		ctx.strokeStyle = '#ffffff';
		ctx.fillStyle = '#ffffff';
		ctx.lineWidth = size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		var last = to_doc(e);
		ctx.beginPath();
		ctx.arc(last.x, last.y, size / 2, 0, Math.PI * 2);
		ctx.fill();
		this.stroke = mask;
		config.need_render = true;
		track_drag(e, function (dx, dy, ev) {
			var p = to_doc(ev);
			ctx.beginPath();
			ctx.moveTo(last.x, last.y);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			last = p;
			config.need_render = true;
		}, function () {
			_this.heal(mask, params);
		});
	}

	async heal(mask, params) {
		if (this.Selection.has()) {
			mask = dilate(mask, 2);
			var ctx = mask.getContext('2d');
			ctx.globalCompositeOperation = 'destination-in';
			ctx.drawImage(this.Selection.mask, 0, 0);
			params = Object.assign({}, params, { no_expand: true });
		}
		this.busy = true;
		try {
			await heal_layer(mask, !!params.sample_all, '스팟 복구 브러시', params.no_expand ? 0 : 2);
		}
		finally {
			this.busy = false;
			this.stroke = null;
			config.need_render = true;
		}
	}

	/**
	 * painted area shown tinted until healing is done
	 */
	render_overlay(ctx) {
		if (!this.stroke || config.TOOL.name != this.name) return;
		ctx.save();
		ctx.globalAlpha = 0.45;
		var tint = this.tint || (this.tint = new_canvas());
		if (tint.width != this.stroke.width || tint.height != this.stroke.height) {
			tint.width = this.stroke.width;
			tint.height = this.stroke.height;
		}
		var tctx = tint.getContext('2d');
		tctx.globalCompositeOperation = 'source-over';
		tctx.clearRect(0, 0, tint.width, tint.height);
		tctx.drawImage(this.stroke, 0, 0);
		tctx.globalCompositeOperation = 'source-in';
		tctx.fillStyle = '#e04060';
		tctx.fillRect(0, 0, tint.width, tint.height);
		ctx.drawImage(tint, 0, 0);
		ctx.restore();
	}
}

export default Spot_heal_class;
