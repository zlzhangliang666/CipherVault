import { describe, it, expect } from 'vitest';
import { createEntryKeycard } from '../crypto/keycard';
import { decodeToken } from '../crypto/skin';
import { bytesToHex, textToBytes } from '../lib/hex';

describe('钥匙卡趣味显示', () => {
  it('display 编码的是密文而不是明文', async () => {
    const entryPassword = 'secret-pw';
    const kc = await createEntryKeycard('master-password', entryPassword, ['letter']);

    // 显示串解码后必须等于密文 hex
    expect(decodeToken(kc.display, ['letter'])).toBe(kc.ctHex);

    // 绝不能等于明文的 hex
    const plainHex = bytesToHex(textToBytes(entryPassword));
    expect(decodeToken(kc.display, ['letter'])).not.toBe(plainHex);
    expect(kc.display).not.toContain('secret');
  });

  it('相同密码每次生成不同的盐与密文', async () => {
    const a = await createEntryKeycard('master-password', 'same-pw', ['poem']);
    const b = await createEntryKeycard('master-password', 'same-pw', ['poem']);
    expect(a.saltHex).not.toBe(b.saltHex);
    expect(a.ctHex).not.toBe(b.ctHex);
    expect(a.display).not.toBe(b.display);
  });
});
