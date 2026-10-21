import { hexToBytes, bytesToHex, textToBytes, bytesToText } from '../lib/hex';
import type { VaultDoc } from '../types';

export async function encryptVault(
  vaultKey: Uint8Array,
  doc: VaultDoc,
): Promise<{ iv: string; ct: string }> {
  const key = await crypto.subtle.importKey('raw', vaultKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const pt = textToBytes(JSON.stringify(doc));
  const ctBuf = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return { iv: bytesToHex(iv), ct: bytesToHex(ctBuf) };
}

export async function decryptVault(
  vaultKey: Uint8Array,
  ivHex: string,
  ctHex: string,
): Promise<VaultDoc> {
  const key = await crypto.subtle.importKey('raw', vaultKey, { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(ivHex) },
      key,
      hexToBytes(ctHex),
    );
    return JSON.parse(bytesToText(new Uint8Array(pt))) as VaultDoc;
  } catch {
    throw new Error('主密码不正确或数据已损坏');
  }
}