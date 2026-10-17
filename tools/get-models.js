/*
 * Downloads the AI models Limn runs on your own computer (they are too big for the repository).
 * Run: npm run models   (about 340 MB, files that already exist are skipped)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const HF = 'https://huggingface.co/';

const MODELS = [
	// content-aware fill / remove tool (LaMa, Apache-2.0)
	['models/lama/lama_fp32.onnx', HF + 'Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx'],
	// AI denoise (NAFNet SIDD width 32, MIT)
	['models/nafnet/nafnet-sidd-w32.onnx', HF + 'tomfl/obscura-models/resolve/main/nafnet-sidd-w32.onnx'],
	// object / subject selection (SlimSAM, Apache-2.0)
	['models/slimsam/config.json', HF + 'Xenova/slimsam-77-uniform/resolve/main/config.json'],
	['models/slimsam/preprocessor_config.json', HF + 'Xenova/slimsam-77-uniform/resolve/main/preprocessor_config.json'],
	['models/slimsam/onnx/vision_encoder_quantized.onnx', HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder_quantized.onnx'],
	['models/slimsam/onnx/prompt_encoder_mask_decoder_quantized.onnx', HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder_quantized.onnx'],
];

function download(url, file, redirects) {
	return new Promise(function (resolve, reject) {
		https.get(url, { headers: { 'User-Agent': 'limn-get-models' } }, function (res) {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (redirects || 0) < 8) {
				res.resume();
				resolve(download(new URL(res.headers.location, url).toString(), file, (redirects || 0) + 1));
				return;
			}
			if (res.statusCode != 200) {
				res.resume();
				reject(new Error(url + ' -> HTTP ' + res.statusCode));
				return;
			}
			const total = parseInt(res.headers['content-length'] || '0', 10);
			let done = 0, shown = -1;
			const part = file + '.part';
			const out = fs.createWriteStream(part);
			res.on('data', function (chunk) {
				done += chunk.length;
				const pct = total ? Math.floor(done * 100 / total) : -1;
				if (pct >= 0 && pct != shown && pct % 10 == 0) {
					shown = pct;
					process.stdout.write('  ' + pct + '%');
				}
			});
			res.pipe(out);
			out.on('finish', function () {
				out.close(function () {
					fs.renameSync(part, file);
					process.stdout.write('\n');
					resolve();
				});
			});
			out.on('error', reject);
		}).on('error', reject);
	});
}

(async function () {
	for (const [rel, url] of MODELS) {
		const file = path.join(root, rel);
		if (fs.existsSync(file) && fs.statSync(file).size > 0) {
			console.log('있음  ' + rel);
			continue;
		}
		fs.mkdirSync(path.dirname(file), { recursive: true });
		console.log('받는 중  ' + rel);
		await download(url, file);
	}
	console.log('AI 모델 준비 완료');
})().catch(function (e) {
	console.error('다운로드 실패: ' + e.message);
	process.exit(1);
});
