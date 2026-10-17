/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../config.js';
import Base_layers_class from './base-layers.js';
import Base_gui_class from './base-gui.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import app from '../app.js';
import { restore_attached } from './layer-surface.js';

var instance = null;

const NOT_IN_HISTORY = ['select_layer', 'select_next_layer', 'select_previous_layer', 'toggle_layer_visibility'];

/**
 * Undo state class. Supports multiple levels undo.
 */
class Base_state_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.layers_archive = [];
		this.levels = 3;
		this.levels_optimal = 3;
		this.enabled = true;
		this.action_history = [];
		this.action_history_index = 0;
		this.action_history_max = 50;
		//actions being stored right now (big images take a while to encode)
		this.in_flight = 0;
		//tools still finishing a stroke after mouse up (raster commit)
		this.busy = 0;
		this.undo_queue = Promise.resolve();

		this.set_events();
	}

	set_events() {
		document.addEventListener('keydown', (event) => {
			const key = (event.key || '').toLowerCase();
			if (this.Helper.is_input(event.target))
				return;

			if (key == "z" && (event.ctrlKey == true || event.metaKey)) {
				// Undo
				this.undo();
				event.preventDefault();
			}
			if (key == "y" && (event.ctrlKey == true || event.metaKey)) {
				// Redo
				this.redo();
				event.preventDefault();
			}
		}, false);
	}

	async do_action(action, options = {}) {
		this.in_flight++;
		try {
			return await this.do_action_now(action, options);
		}
		finally {
			this.in_flight--;
		}
	}

	/**
	 * waits until strokes and actions in progress are stored,
	 * so undo never steps over an unfinished one
	 */
	async wait_idle(max_ms = 20000) {
		var start = Date.now();
		while ((this.in_flight > 0 || this.busy > 0) && Date.now() - start < max_ms) {
			await new Promise(function (resolve) { setTimeout(resolve, 15); });
		}
	}

	/**
	 * undo / redo run one after another, after pending work
	 */
	queue_history(fn) {
		var _this = this;
		var run = async function () {
			await _this.wait_idle();
			var result = await fn();
			await restore_attached();
			return result;
		};
		var result = this.undo_queue.then(run, run);
		this.undo_queue = result.catch(function () {});
		return result;
	}

	async do_action_now(action, options = {}) {
		let error_during_free = false;
		//like Photoshop: selecting or showing/hiding layers is not a history step
		if (NOT_IN_HISTORY.includes(action.action_id)) {
			try {
				await action.do();
			} catch (error) {
				return { status: 'aborted', reason: error };
			}
			this.notify();
			return { status: 'completed' };
		}
		try {
			await action.do();
		} catch (error) {
			// Action aborted. This is usually expected behavior as actions throw errors if they shouldn't run.
			return { status: 'aborted', reason: error };
		}
		// Remove all redo actions from history
		if (this.action_history_index < this.action_history.length) {
			const freed_actions = this.action_history.slice(this.action_history_index, this.action_history.length).reverse();
			this.action_history = this.action_history.slice(0, this.action_history_index);
			for (let freed_action of freed_actions) {
				try {
					await freed_action.free();
				} catch (error) {
					error_during_free = true;
				}
			}
		}
		// Add the new action to history
		const last_action = this.action_history[this.action_history.length - 1];
		if (options.merge_with_history && last_action) {
			if (typeof options.merge_with_history === 'string') {
				options.merge_with_history = [options.merge_with_history];
			}
			if (options.merge_with_history.includes(last_action.action_id)) {
				this.action_history[this.action_history.length - 1] = new app.Actions.Bundle_action(
					last_action.action_id,
					last_action.action_description,
					[last_action, action]
				);
			}
		} else {
			this.action_history.push(action);
			if (this.action_history.length > this.action_history_max) {
				let action_to_free = this.action_history.shift();
				try {
					await action_to_free.free();
				} catch (error) {
					error_during_free = true;
				}
			} else {
				this.action_history_index++;
			}
		}

		// Chrome arbitrary method to determine memory usage, but most people use Chrome so...
		if (window.performance && window.performance.memory) {
			if (window.performance.memory.usedJSHeapSize > window.performance.memory.jsHeapSizeLimit * 0.8) {
				this.free(window.performance.memory.jsHeapSizeLimit * 0.2);
			}
		}

		if (error_during_free) {
			alertify.error('작업 내역 정리 중 문제가 생겼습니다. 작업을 저장한 뒤 새로 고침하세요.');
		}
		this.notify();
		return { status: 'completed' };
	}

	can_redo() {
		return this.action_history_index < this.action_history.length;
	}

	can_undo() {
		return this.action_history_index > 0;
	}

	redo_action() {
		return this.queue_history(() => this.redo_action_now());
	}

	undo_action() {
		return this.queue_history(() => this.undo_action_now());
	}

	async redo_action_now() {
		if (this.can_redo()) {
			const action = this.action_history[this.action_history_index];
			try {
				await action.do();
			} catch (error) {
				console.error(error);
				alertify.error('이 단계는 다시 실행할 수 없습니다.');
				return;
			}
			this.action_history_index++;
			this.notify();
		} else {
			alertify.success('다시 실행할 작업이 없습니다', 3);
		}
	}

	async undo_action_now() {
		if (this.can_undo()) {
			this.action_history_index--;
			try {
				await this.action_history[this.action_history_index].undo();
			} catch (error) {
				//keep history consistent: step stays applied
				console.error(error);
				this.action_history_index++;
				alertify.error('이 단계는 되돌릴 수 없습니다.');
			}
			this.notify();
		} else {
			alertify.success('실행 취소할 작업이 없습니다', 3);
		}
	}

	async scrap_last_action() {
		//tool drops its own just-made step (click without drag): wait until that step is stored
		var start = Date.now();
		while (this.in_flight > 0 && Date.now() - start < 20000) {
			await new Promise(function (resolve) { setTimeout(resolve, 10); });
		}
		if (this.can_undo()) {
			await this.undo_action_now();
			this.action_history.pop();
		}
	}

	// Frees history actions up to the specified memory & database size. Starts with undo history, then moves to redo history.
	async free(memory_size = 0, database_size = 0) {
		let total_memory_freed = 0;
		let total_database_freed = 0;
		let has_error = false;
		let free_complete = false;
		while (this.action_history_index > 0) {
			let action = this.action_history.shift();
			total_memory_freed += action.memory_estimate;
			total_database_freed += action.database_estimate;
			try {
				await action.free();
			} catch (error) {
				has_error = true;
			}
			if (total_memory_freed >= memory_size && total_database_freed >= database_size) {
				free_complete = true;
				break;
			}
			this.action_history_index--;
		}
		if (!free_complete) {
			for (let i = this.action_history.length - 1; i >= 0; i--) {
				let action = this.action_history[i];
				total_memory_freed += action.memory_estimate;
				total_database_freed += action.database_estimate;
				try {
					await action.free();
				} catch (error) {
					has_error = true;
				}
				if (total_memory_freed >= memory_size && total_database_freed >= database_size) {
					free_complete = true;
					break;
				}
			}
		}
		if (has_error) {
			alertify.error('작업 내역 정리 중 문제가 생겼습니다. 작업을 저장한 뒤 새로 고침하세요.');
		}
		return {
			total_memory_freed,
			total_database_freed
		}
	}

	notify() {
		window.dispatchEvent(new Event('photolab-history'));
	}

	save() {
		const message = 'window.State.save() is removed. Use State.do_action() to manage undo history instead.';
		console.warn(message);
		alertify.error(message);
	}

	/**
	 * supports multiple levels undo system
	 */
	undo() {
		//typing in a text layer: store the typed text first, so undo takes it back instead of the whole layer
		var typing = document.getElementById('text_tool_keyboard_input');
		if (typing && typing.__commit) typing.__commit();
		this.undo_action();
	}

	/**
	 * supports multiple levels redo system
	 */
	redo() {
		this.redo_action();
	}

}

export default Base_state_class;
