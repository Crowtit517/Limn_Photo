/*
 * Start screen: the logo draws itself, then one loading step after another.
 * Every step stays at least STEP_MIN on screen (fast computers keep the same rhythm),
 * and waits for the real work when the computer is slower than that.
 */

const STEP_MIN = 420; //ms a step is shown at least
const DRAW_END = 1600; //logo drawing is done (heavy work before this would stutter it)
const STEPS_FROM = 2150; //loading line appears
const FADE_AFTER = 500; //finished screen stays this long

function sleep(ms) {
	return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms)); });
}

//lets the browser draw a frame between heavy steps
export function next_frame() {
	return new Promise(function (resolve) {
		var finished = false;
		var go = function () {
			if (finished) return;
			finished = true;
			resolve();
		};
		requestAnimationFrame(function () { setTimeout(go, 0); });
		//hidden or minimized window: no frames come, start anyway
		setTimeout(go, 100);
	});
}

function reduced_motion() {
	return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * runs the start steps under the splash: steps = [{ text, run }]
 */
export async function run_with_splash(steps) {
	var el = document.getElementById('limn_splash');
	if (!el) {
		for (const step of steps) await step.run();
		return;
	}
	var bar = document.getElementById('limn_splash_bar');
	var status = document.getElementById('limn_splash_status');
	var start = window.__limn_splash_start || 0;
	var since = function () { return performance.now() - start; };
	var quick = reduced_motion();

	//one step at a time: show its name, do the real work, then keep the rhythm
	//(a step's bar part fills STEP_MIN after the previous one at the earliest, later if the work is slower)
	var failure = null;
	var filled_at = STEPS_FROM;
	if (!quick) await sleep(DRAW_END - since());
	for (var i = 0; i < steps.length; i++) {
		status.textContent = steps[i].text;
		await next_frame();
		try {
			await steps[i].run();
		}
		catch (e) {
			//like before: a failed step stops the start, the screen still goes away
			failure = e;
			break;
		}
		if (!quick) await sleep(filled_at + STEP_MIN - since());
		bar.style.width = Math.round((i + 1) / steps.length * 100) + '%';
		filled_at = since();
	}
	await sleep(quick ? 0 : FADE_AFTER);
	el.classList.add('done');
	setTimeout(function () { el.remove(); }, 500);
	if (failure) throw failure;
}
