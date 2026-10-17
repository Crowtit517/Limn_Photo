import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Base_gui_class from './../core/base-gui.js';

export const SAMPLE_SIZES = ['1 픽셀', '3×3 평균', '5×5 평균', '11×11 평균'];
export const SAMPLE_LAYERS = ['모든 레이어', '현재 및 아래', '현재 레이어'];

/**
 * Eyedropper, Photoshop style:
 * samples composited image (or chosen layers), optional averaging,
 * sampling ring shows new color (top) and previous color (bottom).
 */
class Pick_color_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Base_gui = new Base_gui_class();
		this.ctx = ctx;
		this.name = 'pick_color';
		this.source = null;
		this.ring = null;
	}

	load() {
		var _this = this;
		document.addEventListener('mousedown', function (event) {
			if (config.TOOL.name != _this.name) return;
			_this.start(event);
		});
		document.addEventListener('mousemove', function (event) {
			if (config.TOOL.name != _this.name || _this.source == null) return;
			_this.move(event);
		});
		document.addEventListener('mouseup', function () {
			if (config.TOOL.name != _this.name) return;
			_this.end();
		});
		document.addEventListener('touchstart', function (event) {
			if (config.TOOL.name != _this.name) return;
			_this.start(event);
		});
		document.addEventListener('touchmove', function (event) {
			if (config.TOOL.name != _this.name || _this.source == null) return;
			_this.move(event);
		});
		document.addEventListener('touchend', function () {
			if (config.TOOL.name != _this.name) return;
			_this.end();
		});
	}

	start(event) {
		app.Tools.set_mouse_info(event);
		var mouse = this.get_mouse_info(event);
		if (mouse.click_valid == false) return;
		this.begin_sampling(this.getParams());
		this.sample_at(mouse.x, mouse.y);
	}

	move(event) {
		app.Tools.set_mouse_info(event);
		var mouse = this.get_mouse_info(event);
		this.sample_at(mouse.x, mouse.y);
	}

	end() {
		this.source = null;
		this.ring = null;
		config.need_render = true;
	}

	/**
	 * renders sampled layers once per click, moving only reads pixels
	 */
	begin_sampling(params) {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		var mode = params.sample || SAMPLE_LAYERS[0];
		var layers = this.Base_layers.get_sorted_layers(); //top first
		var active_index = layers.findIndex(function (l) { return l.id == config.layer.id; });
		var _this = this;
		var skip;
		if (mode == SAMPLE_LAYERS[2]) {
			skip = function (layer) { return layer.id != config.layer.id; };
		}
		else if (mode == SAMPLE_LAYERS[1]) {
			skip = function (layer) { return layers.indexOf(layer) < active_index; };
		}
		var temp = document.createElement('canvas');
		temp.width = config.WIDTH;
		temp.height = config.HEIGHT;
		this.Base_layers.render_objects(ctx, temp, layers, function () {
			ctx.save();
		}, skip);
		ctx.restore();
		this.source = ctx;
		this.previous_color = config.COLOR;
		this.radius = { '1 픽셀': 0, '3×3 평균': 1, '5×5 평균': 2, '11×11 평균': 5 }[params.sample_size] || 0;
	}

	sample_at(x, y) {
		if (!this.source) return;
		x = Math.floor(x);
		y = Math.floor(y);
		if (x < 0 || y < 0 || x >= config.WIDTH || y >= config.HEIGHT) return;
		var r = this.radius;
		var left = Math.max(0, x - r), top = Math.max(0, y - r);
		var right = Math.min(config.WIDTH - 1, x + r), bottom = Math.min(config.HEIGHT - 1, y + r);
		var data = this.source.getImageData(left, top, right - left + 1, bottom - top + 1).data;
		var sum = [0, 0, 0], weight = 0;
		for (var i = 0; i < data.length; i += 4) {
			var a = data[i + 3] / 255;
			sum[0] += data[i] * a;
			sum[1] += data[i + 1] * a;
			sum[2] += data[i + 2] * a;
			weight += a;
		}
		if (weight == 0) {
			//only transparent pixels - keep current color
			this.ring = { x: x, y: y, color: null };
			config.need_render = true;
			return;
		}
		var hex = this.Helper.rgbToHex(
			Math.round(sum[0] / weight), Math.round(sum[1] / weight), Math.round(sum[2] / weight));
		this.Base_gui.GUI_colors.set_color({ hex: hex, a: 255 });
		this.ring = { x: x, y: y, color: hex };
		config.need_render = true;
	}

	/**
	 * sampling ring around cursor
	 */
	render_overlay(ctx) {
		if (!this.ring || config.TOOL.name != this.name) return;
		var zoom = config.ZOOM || 1;
		var outer = 50 / zoom, inner = 34 / zoom;
		var x = this.ring.x + 0.5, y = this.ring.y + 0.5;
		ctx.save();
		var half = function (color, start, end) {
			ctx.beginPath();
			ctx.arc(x, y, outer, start, end);
			ctx.arc(x, y, inner, end, start, true);
			ctx.closePath();
			ctx.fillStyle = color;
			ctx.fill();
		};
		ctx.shadowColor = 'rgba(0,0,0,0.5)';
		ctx.shadowBlur = 6 / zoom;
		half(this.ring.color || this.previous_color, Math.PI, Math.PI * 2);
		ctx.shadowBlur = 0;
		half(this.previous_color, 0, Math.PI);
		ctx.lineWidth = 1 / zoom;
		ctx.strokeStyle = '#8a8a8a';
		ctx.beginPath();
		ctx.arc(x, y, outer, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(x, y, inner, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * Alt + click from painting tools (Photoshop behaviour)
	 */
	pick_once(x, y) {
		this.begin_sampling(this.getParamsFor());
		this.sample_at(x, y);
	}

	getParamsFor() {
		var tool = config.TOOLS.find(function (t) { return t.name == 'pick_color'; });
		var params = {};
		for (var key in tool.attributes) {
			var item = tool.attributes[key];
			params[key] = typeof item == 'object' ? item.value : item;
		}
		return params;
	}
}

export default Pick_color_class;
