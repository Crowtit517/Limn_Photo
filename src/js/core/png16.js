/*
 * 16 bit PNG read / write (RGBA 16 bit), using the browser's zlib streams.
 */

var crc_table = null;

function crc32(bytes) {
	if (!crc_table) {
		crc_table = new Uint32Array(256);
		for (var n = 0; n < 256; n++) {
			var c = n;
			for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crc_table[n] = c >>> 0;
		}
	}
	var crc = 0xffffffff;
	for (var i = 0; i < bytes.length; i++) crc = crc_table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

async function stream_bytes(data, transform) {
	var stream = new Blob([data]).stream().pipeThrough(transform);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunk(type, data) {
	var out = new Uint8Array(12 + data.length);
	var view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/**
 * Uint16Array RGBA -> 16 bit PNG blob
 */
export async function encode_png16(hd, width, height) {
	var stride = width * 8 + 1;
	var raw = new Uint8Array(stride * height);
	for (var y = 0; y < height; y++) {
		var o = y * stride;
		raw[o] = 0; //no filter
		for (var x = 0, i = y * width * 4; x < width * 4; x++, i++) {
			raw[o + 1 + x * 2] = hd[i] >> 8;
			raw[o + 2 + x * 2] = hd[i] & 255;
		}
	}
	var ihdr = new Uint8Array(13);
	var v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr[8] = 16; //bit depth
	ihdr[9] = 6; //RGBA
	var idat = await stream_bytes(raw, new CompressionStream('deflate'));
	var signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	return new Blob([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

/**
 * bit depth of a PNG file (from the header), 0 if not a PNG
 */
export function png_bit_depth(bytes) {
	if (bytes.length < 29 || bytes[0] != 137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71) return 0;
	return bytes[24];
}

function paeth(a, b, c) {
	var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * 16 bit PNG (gray, gray+alpha, RGB, RGBA; not interlaced) -> { width, height, hd: Uint16Array RGBA }
 * returns null for other PNGs (they open as usual in 8 bit)
 */
export async function decode_png16(buffer) {
	var bytes = new Uint8Array(buffer);
	if (png_bit_depth(bytes) != 16) return null;
	var view = new DataView(buffer);
	var pos = 8, width = 0, height = 0, type = 0, interlace = 0;
	var parts = [];
	while (pos + 8 <= bytes.length) {
		var len = view.getUint32(pos);
		var name = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
		var data = bytes.subarray(pos + 8, pos + 8 + len);
		if (name == 'IHDR') {
			width = view.getUint32(pos + 8);
			height = view.getUint32(pos + 12);
			type = data[9];
			interlace = data[12];
		}
		else if (name == 'IDAT') parts.push(data);
		else if (name == 'IEND') break;
		pos += 12 + len;
	}
	var channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
	if (!channels || interlace) return null;
	var raw = await stream_bytes(new Blob(parts), new DecompressionStream('deflate'));
	var bpp = channels * 2, stride = width * bpp;
	var line = new Uint8Array(stride), prev = new Uint8Array(stride);
	var hd = new Uint16Array(width * height * 4);
	for (var y = 0; y < height; y++) {
		var o = y * (stride + 1), filter = raw[o];
		for (var x = 0; x < stride; x++) {
			var cur = raw[o + 1 + x];
			var a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
			if (filter == 1) cur += a;
			else if (filter == 2) cur += b;
			else if (filter == 3) cur += (a + b) >> 1;
			else if (filter == 4) cur += paeth(a, b, c);
			line[x] = cur & 255;
		}
		for (var px = 0; px < width; px++) {
			var s = px * bpp, d = (y * width + px) * 4;
			var sample = function (k) { return (line[s + k * 2] << 8) | line[s + k * 2 + 1]; };
			if (channels == 1 || channels == 2) {
				hd[d] = hd[d + 1] = hd[d + 2] = sample(0);
				hd[d + 3] = channels == 2 ? sample(1) : 65535;
			}
			else {
				hd[d] = sample(0);
				hd[d + 1] = sample(1);
				hd[d + 2] = sample(2);
				hd[d + 3] = channels == 4 ? sample(3) : 65535;
			}
		}
		var t = prev;
		prev = line;
		line = t;
	}
	return { width: width, height: height, hd: hd };
}
