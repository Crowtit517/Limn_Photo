/*
 * Collects what the desktop app (Tauri) ships into app-dist/: page, bundle, images, AI models
 * and the few runtime files loaded from node_modules. Run: node tools/build-app.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'app-dist');

const COPY = [
	'index.html',
	'dist',
	'images',
	'models/lama',
	'models/slimsam',
	'models/nafnet/nafnet-sidd-w32.onnx',
	'node_modules/onnxruntime-web/dist',
	'node_modules/@huggingface/transformers/dist',
	'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist',
	'node_modules/@colorhythm/libraw-wasm/dist',
];

//not needed at runtime
const SKIP = /\.map$|[\\/]images[\\/](_old|readme)([\\/]|$)|\.d\.ts$/;

function copy(from, to) {
	const stat = fs.statSync(from);
	if (SKIP.test(from)) return 0;
	if (stat.isDirectory()) {
		fs.mkdirSync(to, { recursive: true });
		return fs.readdirSync(from).reduce((n, name) => n + copy(path.join(from, name), path.join(to, name)), 0);
	}
	fs.mkdirSync(path.dirname(to), { recursive: true });
	fs.copyFileSync(from, to);
	return stat.size;
}

fs.rmSync(out, { recursive: true, force: true });
let total = 0;
for (const item of COPY) {
	const from = path.join(root, item);
	if (!fs.existsSync(from)) {
		console.warn('missing:', item);
		continue;
	}
	//Tauri refuses a folder named node_modules in the app: ship it as vendor/
	total += copy(from, path.join(out, item.replace(/node_modules/g, 'vendor')));
}
//runtime paths in the bundle follow the rename
for (const name of fs.readdirSync(path.join(out, 'dist'))) {
	if (!name.endsWith('.js')) continue;
	const file = path.join(out, 'dist', name);
	const text = fs.readFileSync(file, 'utf8');
	if (text.includes('/node_modules/')) fs.writeFileSync(file, text.split('/node_modules/').join('/vendor/'));
}
console.log('app-dist ready:', Math.round(total / 1048576) + ' MB');
