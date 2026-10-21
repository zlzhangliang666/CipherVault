import { bytesToHex, textToBytes, hexToBytes } from '../lib/hex';

export function randomSalt16(): Uint8Array {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return buf;
}

async function deriveBits(pw: string, salt: Uint8Array, iters: number, len = 64): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', textToBytes(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
    base,
    len * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveDk(pw: string, saltHex: string, iters: number): Promise<Uint8Array> {
  return deriveBits(pw, hexToBytes(saltHex), iters, 64);
}

export async function deriveVaultKey(pw: string, saltHex: string, iters: number): Promise<Uint8Array> {
  const dk = await deriveDk(pw, saltHex, iters);
  return dk.slice(0, 32);
}

export async function deriveAuthHash(pw: string, saltHex: string, iters: number): Promise<string> {
  const dk = await deriveDk(pw, saltHex, iters);
  return bytesToHex(dk.slice(32, 64));
}