/*
 * View navigation shared by hand tool, zoom tool, space bar and mouse wheel.
 */
import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';

/**
 * scroll view by screen pixels
 */
export function pan_by(dx, dy) {
	zoomView.move(dx, dy);
	config.need_render = true;
}

/**
 * zoom one step in (+1) or out (-1) keeping the point under the cursor
 */
export function zoom_at(event, direction) {
	var canvas = document.getElementById('canvas_minipaint');
	var p = view_xy(event);
	var preview = app.GUI.GUI_preview;
	preview.zoom_data.x = Math.max(0, Math.min(canvas.width, p[0]));
	preview.zoom_data.y = Math.max(0, Math.min(canvas.height, p[1]));
	preview.zoom(direction, event);
}

/**
 * drag helper: calls on_move(dx, dy) until mouse is released
 */
export function track_drag(start_event, on_move, on_end) {
	var last_x = start_event.clientX, last_y = start_event.clientY;
	var move = function (e) {
		e.preventDefault();
		e.stopImmediatePropagation();
		var dx = e.clientX - last_x, dy = e.clientY - last_y;
		//rotated view: screen movement turned back into canvas directions
		if (config.VIEW_ROTATION) {
			var t = -config.VIEW_ROTATION * Math.PI / 180;
			var rx = dx * Math.cos(t) - dy * Math.sin(t);
			dy = dx * Math.sin(t) + dy * Math.cos(t);
			dx = rx;
		}
		on_move(dx, dy, e);
		last_x = e.clientX;
		last_y = e.clientY;
	};
	var up = function (e) {
		e.stopImmediatePropagation();
		document.removeEventListener('mousemove', move, true);
		document.removeEventListener('mouseup', up, true);
		if (on_end) on_end(e);
	};
	document.addEventListener('mousemove', move, true);
	document.addEventListener('mouseup', up, true);
}

export function set_cursor(cursor) {
	var wrapper = document.getElementById('main_wrapper');
	if (wrapper) wrapper.style.cursor = cursor;
}

/**
 * Rotate View (R): the whole canvas turns on screen, the image itself does not change
 */
export function set_view_rotation(deg) {
	deg = Number(deg) || 0;
	//-180 .. 180 like the Photoshop angle field
	deg = ((deg % 360) + 360) % 360;
	if (deg > 180) deg -= 360;
	if (Math.abs(deg) < 0.05) deg = 0;
	var was = !!config.VIEW_ROTATION;
	config.VIEW_ROTATION = Math.round(deg * 10) / 10;
	var wrap = document.getElementById('canvas_wrapper');
	if (wrap) wrap.style.transform = config.VIEW_ROTATION ? 'rotate(' + config.VIEW_ROTATION + 'deg)' : '';
	//a rotated view needs a canvas big enough to cover the window corners
	if (was != !!config.VIEW_ROTATION) app.GUI.prepare_canvas();
	config.need_render = true;
	window.dispatchEvent(new Event('photolab-view-rotation'));
}

/**
 * mouse position on the (unrotated) canvas, in canvas pixels: [x, y]
 */
export function view_xy(e) {
	var canvas = document.getElementById('canvas_minipaint');
	var rect = canvas.getBoundingClientRect();
	var deg = config.VIEW_ROTATION || 0;
	if (!deg) return [e.clientX - rect.left, e.clientY - rect.top];
	var a = -deg * Math.PI / 180;
	var dx = e.clientX - (rect.left + rect.width / 2);
	var dy = e.clientY - (rect.top + rect.height / 2);
	return [
		dx * Math.cos(a) - dy * Math.sin(a) + canvas.offsetWidth / 2,
		dx * Math.sin(a) + dy * Math.cos(a) + canvas.offsetHeight / 2,
	];
}

/**
 * screen angle (degrees) of a point around the canvas center
 */
export function screen_angle(e) {
	var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
	return Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI;
}

/**
 * drag to rotate the view; Shift snaps to 15 degrees
 */
export function rotate_drag(start_event, on_end) {
	var start = screen_angle(start_event);
	var base = config.VIEW_ROTATION || 0;
	set_cursor('grabbing');
	track_drag(start_event, function (dx, dy, e) {
		var deg = base + screen_angle(e) - start;
		if (e.shiftKey) deg = Math.round(deg / 15) * 15;
		set_view_rotation(deg);
	}, on_end);
}
