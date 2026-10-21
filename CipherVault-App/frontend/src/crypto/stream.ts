import { textToBytes, bytesToText, hexToBytes, bytesToHex, concatBytes, uint32be } from '../lib/hex';
import { deriveDk } from './kdf';

export interface KeycardPayload {
  saltHex: string;
  ivHex: string;
  ctHex: string;
  tagHex: string;
  iters: number;
  display: string;
  skinName: string;
  /** 趣味显示的逐位规则，供导出的脚本还原显示串 */
  rules?: Array<'letter' | 'number' | 'poem'>;
  entryName?: string;
}

async function hmac(keyBytes: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
}

export async function keycardEncrypt(
  masterPassword: string,
  entryPassword: string,
  salt: Uint8Array,
  iv: Uint8Array,
  iters: number,
): Promise<{ ct: Uint8Array; tag: Uint8Array }> {
  const dk = await deriveDk(masterPassword, bytesToHex(salt), iters);
  const enc = dk.slice(0, 32);
  const mac = dk.slice(32, 64);
  const pt = textToBytes(entryPassword);

  const ksBlocks: Uint8Array[] = [];
  let ctr = 0;
  while (ksBlocks.reduce((s, b) => s + b.length, 0) < pt.length) {
    ksBlocks.push(await hmac(enc, concatBytes(iv, uint32be(ctr))));
    ctr++;
  }
  const ks = concatBytes(...ksBlocks);

  const ct = new Uint8Array(pt.length);
  for (let i = 0; i < pt.length; i++) {
    ct[i] = pt[i] ^ ks[i];
  }

  const tag = await hmac(mac, concatBytes(iv, ct));
  return { ct, tag };
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function keycardDecrypt(
  masterPassword: string,
  saltHex: string,
  ivHex: string,
  ctHex: string,
  tagHex: string,
  iters: number,
): Promise<string> {
  const dk = await deriveDk(masterPassword, saltHex, iters);
  const mac = dk.slice(32, 64);
  const enc = dk.slice(0, 32);

  const iv = hexToBytes(ivHex);
  const ct = hexToBytes(ctHex);

  // Step 1: verify tag
  const expectedTag = await hmac(mac, concatBytes(iv, ct));
  if (!constantTimeEqual(expectedTag, hexToBytes(tagHex))) {
    throw new Error('主密码不正确');
  }

  // Step 2: decrypt
  const ksBlocks: Uint8Array[] = [];
  let ctr = 0;
  while (ksBlocks.reduce((s, b) => s + b.length, 0) < ct.length) {
    ksBlocks.push(await hmac(enc, concatBytes(iv, uint32be(ctr))));
    ctr++;
  }
  const ks = concatBytes(...ksBlocks);

  const pt = new Uint8Array(ct.length);
  for (let i = 0; i < ct.length; i++) {
    pt[i] = ct[i] ^ ks[i];
  }
  return bytesToText(pt);
}