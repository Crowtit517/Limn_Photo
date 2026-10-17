import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

class Brush_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.name = 'brush';
		this.layer = {};
		this.params_hash = false;
		this.pressure_supported = false;
		this.pointer_pressure = 0; // has range [0 - 1]
		this.max_speed = 20;
		this.power = 2; //how speed affects size
		this.event_links = [];
		this.data_index = 0;
	}

	load() {
		var _this = this;
		var is_touch = false;

		//pointer events
		document.addEventListener('pointerdown', function (event) {
			_this.pointerdown(event);
		});
		document.addEventListener('pointermove', function (event) {
			_this.pointermove(event);
		});

		//mouse events
		document.addEventListener('mousedown', function (event) {
			if(is_touch)
				return;
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			if(is_touch)
				return;
			_this.dragMove(event);
		});
		document.addEventListener('mouseup', function (event) {
			if(is_touch)
				return;
			_this.dragEnd(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			is_touch = true;
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('touchend', function (event) {
			_this.dragEnd(event);
		});
	}

	pointerdown(e) {
		// Devices that don't actually support pen pressure can give 0.5 as a false reading.
		// It is highly unlikely a real pen will read exactly 0.5 at the start of a stroke.
		if (e.pressure && e.pressure !== 0 && e.pressure !== 0.5 && e.pressure <= 1) {
			this.pressure_supported = true;
			this.pointer_pressure = e.pressure;
		} else {
			this.pressure_supported = false;
		}
	}

	pointermove(e) {
		// Pressure of exactly 1 seems to be an input error, sometimes I see it when lifting the pen
		// off the screen when pressure reading should be near 0.
		if (this.pressure_supported && e.pressure < 1) {
			this.pointer_pressure = e.pressure;
		}
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		this.click_counter++;

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			this.event_links.push({
				identifier: identifier,
				index: this.data_index,
			});

			_this.mousedown_action(events[i], this.data_index, identifier);

			this.data_index++;
		}
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		if (typeof event.changedTouches == "undefined") {
			//mouse cursor
			var mouse = _this.get_mouse_info(event);
			var params = _this.getParams();
			_this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
		}

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			for(var j = 0; j < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					//found link
					_this.mousemove_action(events[i], this.event_links[j].index);
					break;
				}
			}
		}
	}

	dragEnd(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		var mouse = this.get_mouse_info(event);
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				//unlink
				identifier = events[i].identifier;
			}

			for(var j = 0; j < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					this.event_links.splice(j, 1);
					break;
				}
			}

			_this.mouseup_action(events[i]);
		}
	}

	mousedown_action(e, index, event_identifier) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var params_hash = this.get_params_hash();

		if (config.layer.type != this.name || params_hash != this.params_hash) {
			//register new object - current layer is not ours or params changed
			this.layer = {
				type: this.name,
				//opacity limits the whole stroke, like Photoshop brush opacity
				opacity: Math.max(1, Math.min(100, this.getParams().opacity || 100)),
				data: [[]],
				params: this.clone(this.getParams()),
				status: 'draft',
				render_function: [this.name, 'render'],
				x: 0,
				y: 0,
				width: config.WIDTH,
				height: config.HEIGHT,
				hide_selection_if_active: true,
				rotate: null,
				is_vector: true,
				color: config.COLOR
			};
			app.State.do_action(
				new app.Actions.Bundle_action('new_brush_layer', 'New Brush Layer', [
					new app.Actions.Insert_layer_action(this.layer)
				])
			);
			this.params_hash = params_hash;

			//reset event links index
			this.data_index = 0;
			index = 0;
			this.event_links = [];
			this.event_links.push({
				identifier: event_identifier,
				index: this.data_index,
			});
		}
		else {
			const new_data = JSON.parse(JSON.stringify(config.layer.data));
			new_data.push([]);
			app.State.do_action(
				new app.Actions.Bundle_action('update_brush_layer', 'Update Brush Layer', [
					new app.Actions.Update_layer_action(config.layer.id, {
						data: new_data
					})
				])
			);
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var current_group = config.layer.data[index];
		var params = this.getParams();
		var new_size = this.get_stroke_size(params);

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		this.smooth_point = { x: mouse_coords.x, y: mouse_coords.y };

		current_group.push([mouse_coords.x - config.layer.x, mouse_coords.y - config.layer.y, new_size]);
		this.Base_layers.render();
	}

	/**
	 * line width: real pen pressure when available, constant for mouse
	 */
	get_stroke_size(params) {
		if (params.pressure == true && this.pressure_supported) {
			return Math.max(0.5, params.size * this.pointer_pressure * 2);
		}
		return params.size;
	}

	/**
	 * stabilizer 0..100: pen tip follows the pointer with a delay, which removes hand shake
	 */
	get_stabilized_point(params, x, y) {
		var strength = Math.min(100, Math.max(0, this.get_stabilizer_value(params)));
		if (strength == 0 || this.smooth_point == null) {
			this.smooth_point = { x: x, y: y };
			return this.smooth_point;
		}
		var follow = 1 - Math.pow(strength / 100, 0.5) * 0.92;
		this.smooth_point = {
			x: this.smooth_point.x + (x - this.smooth_point.x) * follow,
			y: this.smooth_point.y + (y - this.smooth_point.y) * follow,
		};
		return this.smooth_point;
	}

	get_stabilizer_value(params) {
		var value = params.stabilizer;
		if (value != null && typeof value == 'object') {
			value = value.value;
		}
		return value == null ? 0 : value;
	}

	mousemove_action(e, index) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var params = this.getParams();
		var current_group = config.layer.data[index];
		var new_size = this.get_stroke_size(params);

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		var point = this.get_stabilized_point(params, mouse_coords.x, mouse_coords.y);

		current_group.push([point.x - config.layer.x, point.y - config.layer.y, new_size]);
		config.layer.status = 'draft';
		this.Base_layers.render();
	}

	mouseup_action(e, index) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}

		config.layer.status = null;

		this.check_dimensions();
		this.Base_layers.render();
	}

	render(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var params = layer.params;
		if (params.flow !== undefined) {
			//Photoshop style brush: dabs with hardness and flow
			this.render_dabs(ctx, layer);
			return;
		}
		var size = params.size;

		//set styles
		ctx.save();
		ctx.fillStyle = layer.color;
		ctx.strokeStyle = layer.color;
		ctx.lineWidth = params.size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.translate(layer.x, layer.y);

		var data = layer.data;

		//check for legacy format
		data = this.check_legacy_format(data);

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k]; //data from mouse down till mouse release
			var group_n = group_data.length;

			if (params.stabilizer !== undefined) {
				//new strokes: input already stabilized, draw smooth curve with per-point width
				this.render_smooth(ctx, group_data);
			}
			else if (params.pressure == false) {
				//legacy: stabilized lines method does not support multiple line sizes
				this.render_stabilized(ctx, group_data);
			}
			else {
				if (group_data[0]) {
					ctx.beginPath();
					ctx.moveTo(group_data[0][0], group_data[0][1]);
					for (var i = 1; i < group_n; i++) {
						if (group_data[i] === null) {
							//break
							ctx.beginPath();
						}
						else {
							//line

							ctx.lineWidth = group_data[i][2];

							if (group_data[i - 1] == null && group_data[i + 1] == null) {
								//exception - point
								ctx.arc(group_data[i][0], group_data[i][1], size / 2, 0, 2 * Math.PI, false);
								ctx.fill();
							}
							else if (group_data[i - 1] != null) {
								//lines
								ctx.lineWidth = group_data[i][2];
								ctx.beginPath();
								ctx.moveTo(group_data[i - 1][0], group_data[i - 1][1]);
								ctx.lineTo(group_data[i][0], group_data[i][1]);
								ctx.stroke();
							}
						}
					}
					if (group_data[1] == null) {
						//point
						ctx.beginPath();
						ctx.arc(group_data[0][0], group_data[0][1], size / 2, 0, 2 * Math.PI, false);
						ctx.fill();
					}
				}
			}
		}

		ctx.translate(-layer.x, -layer.y);
		ctx.restore();
	}

	/**
	 * draw stabilized lines
	 * author: Manoj Verma
	 * source: https://stackoverflow.com/questions/7891740/drawing-smooth-lines-with-canvas/44810470#44810470
	 *
	 * @param ctx
	 * @param queue
	 */
	/**
	 * round brush tip, 1 = hard edge, 0 = very soft (Photoshop hardness)
	 */
	get_stamp(color, hardness, tip) {
		tip = tip && tip.value || tip || '원형';
		var key = color + '|' + hardness + '|' + tip;
		if (this.stamp && this.stamp.key == key) return this.stamp.canvas;
		if (tip != '원형') {
			var shaped = this.shaped_stamp(color, hardness, tip);
			this.stamp = { key: key, canvas: shaped };
			return shaped;
		}
		var size = 128;
		var canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		var ctx = canvas.getContext('2d');
		var r = size / 2;
		var grad = ctx.createRadialGradient(r, r, 0, r, r, r);
		var inner = Math.min(0.99, Math.max(0, hardness));
		grad.addColorStop(0, color);
		grad.addColorStop(inner, color);
		//smooth (smoothstep) falloff outside the hard core
		var steps = 6;
		for (var i = 1; i <= steps; i++) {
			var t = i / steps;
			grad.addColorStop(inner + (1 - inner) * t, this.with_alpha(color, i == steps ? 0 : (1 - t) * (1 - t) * (1 + 2 * t)));
		}
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(r, r, r, 0, Math.PI * 2);
		ctx.fill();
		this.stamp = { key: key, canvas: canvas };
		return canvas;
	}

	/**
	 * other brush tips (Photoshop brush presets)
	 */
	shaped_stamp(color, hardness, tip) {
		var size = 128, r = size / 2;
		var canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = color;
		var seed = 7;
		var rand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
		if (hardness < 0.99 && tip != '스프레이') ctx.filter = 'blur(' + ((1 - hardness) * 10) + 'px)';
		if (tip == '사각형') {
			ctx.fillRect(10, 10, size - 20, size - 20);
		}
		else if (tip == '분필') {
			for (var i = 0; i < 900; i++) {
				var a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (r - 6);
				ctx.globalAlpha = 0.25 + rand() * 0.6;
				ctx.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 2 + rand() * 4, 2 + rand() * 3);
			}
		}
		else if (tip == '스프레이') {
			for (var j = 0; j < 260; j++) {
				var b = rand() * Math.PI * 2, e = Math.pow(rand(), 0.7) * (r - 4);
				ctx.globalAlpha = 0.5 + rand() * 0.5;
				ctx.beginPath();
				ctx.arc(r + Math.cos(b) * e, r + Math.sin(b) * e, 1 + rand() * 2.2, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		else if (tip == '잎사귀') {
			ctx.beginPath();
			ctx.ellipse(r, r, r - 8, (r - 8) * 0.38, Math.PI / 4, 0, Math.PI * 2);
			ctx.fill();
		}
		else if (tip == '별') {
			ctx.beginPath();
			for (var k = 0; k < 10; k++) {
				var rad = k % 2 ? (r - 8) * 0.45 : r - 8, ang = -Math.PI / 2 + k * Math.PI / 5;
				ctx.lineTo(r + Math.cos(ang) * rad, r + Math.sin(ang) * rad);
			}
			ctx.closePath();
			ctx.fill();
		}
		return canvas;
	}

	with_alpha(color, alpha) {
		var hex = color.replace('#', '');
		if (hex.length == 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
		var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
		return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, alpha)) + ')';
	}

	/**
	 * stroke as stamped dabs: flow = paint per dab (builds up), hardness = edge softness
	 */
	render_dabs(ctx, layer) {
		var params = layer.params;
		var hardness = (params.hardness === undefined ? 100 : params.hardness) / 100;
		var flow = Math.max(1, Math.min(100, params.flow)) / 100;
		var stamp = this.get_stamp(layer.color, hardness, params.tip);
		var tip_name = params.tip && params.tip.value || params.tip || '원형';
		var spacing_pct = params.spacing && params.spacing.value || params.spacing;
		var scatter = (params.scatter && params.scatter.value || params.scatter || 0) / 100;
		var rotating = tip_name == '잎사귀' || tip_name == '분필' || tip_name == '스프레이';
		var seed = 1;
		var rand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
		var buffer = this.dab_buffer;
		if (!buffer || buffer.width != config.WIDTH || buffer.height != config.HEIGHT) {
			buffer = this.dab_buffer = document.createElement('canvas');
			buffer.width = config.WIDTH;
			buffer.height = config.HEIGHT;
		}
		var bctx = buffer.getContext('2d');
		bctx.setTransform(1, 0, 0, 1, 0, 0);
		bctx.clearRect(0, 0, buffer.width, buffer.height);
		bctx.globalAlpha = flow;
		//soft brushes look bigger at same size; scale tip so the visible size matches
		var tip_scale = 1 + (1 - hardness) * 0.5;
		var data = this.check_legacy_format(layer.data);
		for (var k = 0; k < data.length; k++) {
			var points = data[k].filter(function (p) { return p != null; });
			if (points.length == 0) continue;
			var dab = function (x, y, size) {
				var d = Math.max(1, size * tip_scale);
				if (scatter > 0) {
					x += (rand() - 0.5) * size * scatter * 2;
					y += (rand() - 0.5) * size * scatter * 2;
				}
				if (rotating) {
					bctx.save();
					bctx.translate(x + layer.x, y + layer.y);
					bctx.rotate(rand() * Math.PI * 2);
					bctx.drawImage(stamp, -d / 2, -d / 2, d, d);
					bctx.restore();
					return;
				}
				bctx.drawImage(stamp, x + layer.x - d / 2, y + layer.y - d / 2, d, d);
			};
			dab(points[0][0], points[0][1], points[0][2]);
			var carry = 0;
			for (var i = 1; i < points.length; i++) {
				var a = points[i - 1], b = points[i];
				var dx = b[0] - a[0], dy = b[1] - a[1];
				var length = Math.sqrt(dx * dx + dy * dy);
				//Photoshop default spacing is 25%; denser dabs only for full flow (smoother edge, no build-up)
				var spacing = Math.max(0.5, Math.min(a[2], b[2]) * (spacing_pct && spacing_pct != 25 ? spacing_pct / 100 : (flow < 1 ? 0.25 : 0.12)));
				var t = carry;
				while (t <= length) {
					var f = length == 0 ? 0 : t / length;
					dab(a[0] + dx * f, a[1] + dy * f, a[2] + (b[2] - a[2]) * f);
					t += spacing;
				}
				carry = t - length;
			}
		}
		ctx.save();
		ctx.drawImage(buffer, 0, 0);
		ctx.restore();
	}

	/**
	 * Quadratic curve through segment midpoints. Constant width is drawn as one path,
	 * varying width (pen pressure) as short curve pieces with averaged width.
	 */
	render_smooth(ctx, points) {
		var data = points.filter(function (p) { return p != null; });
		var n = data.length;
		if (n == 0) return;
		if (n == 1) {
			ctx.beginPath();
			ctx.arc(data[0][0], data[0][1], data[0][2] / 2, 0, 2 * Math.PI, false);
			ctx.fill();
			return;
		}
		var constant = data.every(function (p) { return p[2] == data[0][2]; });
		var mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };

		if (constant) {
			ctx.lineWidth = data[0][2];
			ctx.beginPath();
			ctx.moveTo(data[0][0], data[0][1]);
			for (var i = 1; i < n - 1; i++) {
				var m = mid(data[i], data[i + 1]);
				ctx.quadraticCurveTo(data[i][0], data[i][1], m[0], m[1]);
			}
			ctx.lineTo(data[n - 1][0], data[n - 1][1]);
			ctx.stroke();
			return;
		}

		var start = [data[0][0], data[0][1]];
		for (var i = 1; i < n; i++) {
			var end = i < n - 1 ? mid(data[i], data[i + 1]) : [data[i][0], data[i][1]];
			ctx.lineWidth = (data[i - 1][2] + data[i][2]) / 2;
			ctx.beginPath();
			ctx.moveTo(start[0], start[1]);
			ctx.quadraticCurveTo(data[i][0], data[i][1], end[0], end[1]);
			ctx.stroke();
			start = end;
		}
	}

	render_stabilized(ctx, queue) {
		var data = JSON.parse(JSON.stringify(queue));
		var n = data.length;

		if (data.length == 1) {
			//point
			var point = data[0];
			ctx.beginPath();
			ctx.arc(point[0], point[1], point[2] / 2, 0, 2 * Math.PI, false);
			ctx.fill();
			return;
		}
		else if (data.length <= 5) {
			//not enough points yet

			for (var i = 1; i < n; i++) {
				ctx.beginPath();
				ctx.moveTo(data[i - 1][0], data[i - 1][1]);
				ctx.lineTo(data[i][0], data[i][1]);
				ctx.stroke();
			}
			return;
		}

		//fix for loose ending, so lets duplicate last point
		data.push([data[n - 1][0], data[n - 1][1]]);

		ctx.beginPath();
		ctx.moveTo(data[0][0], data[0][1]);

		//prepare
		var temp_data1 = [data[0]];
		var c, d;
		for (var i = 1; i < data.length - 1;  i = i+1) {
			c = (data[i][0] + data[i + 1][0]) / 2;
			d = (data[i][1] + data[i + 1][1]) / 2;
			temp_data1.push([c, d]);
		}

		var temp_data2 = [temp_data1[0]];
		for (var i = 1; i < temp_data1.length - 1;  i = i+1) {
			c = (temp_data1[i][0] + temp_data1[i + 1][0]) / 2;
			d = (temp_data1[i][1] + temp_data1[i + 1][1]) / 2;
			temp_data2.push([c, d]);
		}

		var temp_data = [temp_data2[0]];
		for (var i = 1; i < temp_data2.length - 1;  i = i+1) {
			c = (temp_data2[i][0] + temp_data2[i + 1][0]) / 2;
			d = (temp_data2[i][1] + temp_data2[i + 1][1]) / 2;
			temp_data.push([c, d]);
		}

		//draw
		for (var i = 1; i < temp_data.length - 2;  i = i+1) {
			c = (temp_data[i][0] + temp_data[i + 1][0]) / 2;
			d = (temp_data[i][1] + temp_data[i + 1][1]) / 2;
			ctx.quadraticCurveTo(temp_data[i][0], temp_data[i][1], c, d);
		}

		// For the last 2 points
		ctx.quadraticCurveTo(
			temp_data[i][0],
			temp_data[i][1],
			temp_data[i+1][0],
			temp_data[i+1][1]
		);
		ctx.stroke();
	}

	check_legacy_format(data) {
		//check for legacy format
		if(data.length > 0 && typeof data[0][0] == "number"){
			//convert
			var legacy = JSON.parse(JSON.stringify(data));
			data = [];
			data.push([]);
			var group_index = 0;
			for(var i in legacy){
				if(legacy[i] === null){
					data.push([]);
					group_index++;
				}
				else {
					data[group_index].push([legacy[i][0], legacy[i][1], legacy[i][2]]);
				}
			}
		}

		return data;
	}

	/**
	 * recalculate layer x, y, width and height values.
	 */
	check_dimensions() {
		var data = JSON.parse(JSON.stringify(config.layer.data)); // Deep copy for history
		this.check_legacy_format(data);

		if(config.layer.data.length == 0 || data[0].length == 0)
			return;

		//find bounds
		var min_x = data[0][0][0];
		var min_y = data[0][0][1];
		var max_x = data[0][0][0];
		var max_y = data[0][0][1];

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 1; i < group_n; i++) {
				min_x = Math.min(min_x, group_data[i][0]);
				min_y = Math.min(min_y, group_data[i][1]);
				max_x = Math.max(max_x, group_data[i][0]);
				max_y = Math.max(max_y, group_data[i][1]);
			}
		}

		//move current data
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 0; i < group_n; i++) {
				group_data[i][0] = group_data[i][0] - min_x;
				group_data[i][1] = group_data[i][1] - min_y;
			}
		}

		//change layers bounds
		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: config.layer.x + min_x,
				y: config.layer.y + min_y,
				width: max_x - min_x,
				height: max_y - min_y,
				data
			}),
			{
				merge_with_history: ['new_brush_layer', 'update_brush_layer']
			}
		);
	}

}

export default Brush_class;
