const HEX = '0123456789abcdef';

export function bytesToHex(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    s += HEX[buf[i] >> 4] + HEX[buf[i] & 0xf];
  }
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex 字符串长度必须为偶数');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = HEX.indexOf(hex[i * 2]);
    const lo = HEX.indexOf(hex[i * 2 + 1]);
    if (hi === -1 || lo === -1) throw new Error(`非法 hex 字符位于位置 ${i * 2}`);
    out[i] = (hi << 4) | lo;
  }
  return out;
}

export function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToText(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function uint32be(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (n >>> 24) & 0xff;
  buf[1] = (n >>> 16) & 0xff;
  buf[2] = (n >>> 8) & 0xff;
  buf[3] = n & 0xff;
  return buf;
}