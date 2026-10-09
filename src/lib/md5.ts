/** MD5 of a UTF-8 string as hex (RFC 1321). Used to sign Yandex Music download links. */
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words = new Uint32Array((((bytes.length + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[words.length - 2] = bytes.length * 8;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let o = 0; o < words.length; o += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      let f: number, g: number;
      if (r === 0) (f = (b & c) | (~b & d)), (g = i);
      else if (r === 1) (f = (d & b) | (~d & c)), (g = (5 * i + 1) % 16);
      else if (r === 2) (f = b ^ c ^ d), (g = (3 * i + 5) % 16);
      else (f = c ^ (b | ~d)), (g = (7 * i) % 16);
      const s = S[r * 4 + (i % 4)];
      const x = (a + f + K[i] + words[o + g]) >>> 0;
      [a, d, c] = [d, c, b];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
    }
    [a0, b0, c0, d0] = [(a0 + a) >>> 0, (b0 + b) >>> 0, (c0 + c) >>> 0, (d0 + d) >>> 0];
  }
  return [a0, b0, c0, d0].map((w) => Array.from({ length: 4 }, (_, i) => ((w >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
}
