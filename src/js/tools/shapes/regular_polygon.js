import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';

/**
 * Polygon tool (U), Photoshop style: drag draws a regular polygon, "sides" sets the number of sides
 */
class Regular_polygon_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'regular_polygon';
		this.layer = {};
		this.best_ratio = 1;
		this.snap_line_info = { x: null, y: null };
	}

	load() {
		this.default_events();
	}

	mousedown(e) {
		this.shape_mousedown(e);
	}

	mousemove(e) {
		this.shape_mousemove(e);
	}

	mouseup(e) {
		this.shape_mouseup(e);
	}

	render_overlay(ctx) {
		var ctx = this.Base_layers.ctx;
		this.render_overlay_parent(ctx);
	}

	/**
	 * corners in a 100x100 box, first corner on top (like Photoshop)
	 */
	coords(sides) {
		sides = Math.max(3, Math.min(100, parseInt(sides) || 5));
		var out = [];
		for (var i = 0; i < sides; i++) {
			var a = -Math.PI / 2 + i * 2 * Math.PI / sides;
			out.push([50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]);
		}
		return out;
	}

	demo(ctx, x, y, width, height) {
		ctx.fillStyle = '#aaa';
		ctx.strokeStyle = '#555';
		ctx.lineWidth = 2;
		this.draw_shape(ctx, x, y, width, height, this.coords(5));
	}

	render(ctx, layer) {
		var params = layer.params;
		ctx.save();
		ctx.strokeStyle = 'transparent';
		ctx.fillStyle = 'transparent';
		if (params.border) ctx.strokeStyle = params.border_color;
		if (params.fill) ctx.fillStyle = params.fill_color;
		ctx.lineWidth = params.border_size;
		ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
		ctx.rotate(layer.rotate * Math.PI / 180);
		var sides = params.sides && typeof params.sides == 'object' ? params.sides.value : params.sides;
		this.draw_shape(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, this.coords(sides));
		ctx.restore();
	}

	draw_shape(ctx, x, y, width, height, coords) {
		ctx.lineJoin = 'round';
		ctx.beginPath();
		coords.forEach(function (c, i) {
			var px = x + c[0] * width / 100, py = y + c[1] * height / 100;
			if (i == 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		});
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
}

export default Regular_polygon_class;
