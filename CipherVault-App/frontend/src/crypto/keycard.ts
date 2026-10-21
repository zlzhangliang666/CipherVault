import type { EntryKeycard } from '../types';
import { bytesToHex } from '../lib/hex';
import { randomSalt16 } from './kdf';
import { keycardEncrypt } from './stream';
import { encodeToken } from './skin';

export const KEYCARD_ITERS = 200_000;

type RuleName = 'letter' | 'number' | 'poem';

/**
 * 生成条目的钥匙卡载荷。
 * 关键约束：display 必须由**密文** ctHex 编码得到，绝不能用明文。
 */
export async function createEntryKeycard(
  masterPassword: string,
  entryPassword: string,
  rules: RuleName[],
): Promise<EntryKeycard> {
  const salt = randomSalt16();
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv);

  const { ct, tag } = await keycardEncrypt(masterPassword, entryPassword, salt, iv, KEYCARD_ITERS);
  const ctHex = bytesToHex(ct);

  return {
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ctHex,
    tagHex: bytesToHex(tag),
    iters: KEYCARD_ITERS,
    display: encodeToken(ctHex, rules),
  };
}
