import Dodge_class from './dodge.js';

/**
 * Burn tool (Shift+O): darkens
 */
class Burn_class extends Dodge_class {

	constructor(ctx) {
		super(ctx);
		this.name = 'burn';
		this.history_name = '번 도구';
		this.direction = -1;
	}
}

export default Burn_class;
