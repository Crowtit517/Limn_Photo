// Runs Limn in the browser: npm start  (or node tools/serve.js [port])
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = parseInt(process.argv[2], 10) || 8080;
const types = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.wasm': 'application/wasm',
	'.onnx': 'application/octet-stream', '.ico': 'image/x-icon', '.map': 'application/json',
};

http.createServer((req, res) => {
	let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
	if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
	fs.readFile(file, (err, data) => {
		if (err) { res.writeHead(404); return res.end('Not found'); }
		res.writeHead(200, {
			'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
			// Needed for multi-threaded WASM (SharedArrayBuffer) used by the AI tools
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless',
			'Cache-Control': 'no-cache',
		});
		res.end(data);
	});
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
