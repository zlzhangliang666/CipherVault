import { describe, it, expect } from 'vitest';
import { encryptVault, decryptVault } from '../crypto/vault';
import type { VaultDoc } from '../types';

const sampleDoc: VaultDoc = {
  entries: [
    {
      id: 'test',
      name: '示例',
      account: 'user@example.com',
      category: '通用',
      notes: '',
      fav: false,
      ts: 1,
      values: [
        {
          id: 'test-v1',
          label: '密码',
          value: 'p@ssw0rd!',
          skin: { name: '字母皮肤', rules: ['letter'] },
        },
      ],
    },
  ],
  categories: ['通用'],
  settings: { autoLockMin: 5, clipboardClearSec: 30 },
};

describe('encryptVault / decryptVault', () => {
  it('roundtrip', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const { iv, ct } = await encryptVault(key, sampleDoc);
    const decrypted = await decryptVault(key, iv, ct);
    expect(decrypted).toEqual(sampleDoc);
  });

  it('wrong key throws', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const { iv, ct } = await encryptVault(key, sampleDoc);
    await expect(decryptVault(wrongKey, iv, ct)).rejects.toThrow('主密码不正确或数据已损坏');
  });

  it('tampered ct throws', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const { iv, ct } = await encryptVault(key, sampleDoc);
    const tampered = ct.slice(0, -2) + 'ff';
    await expect(decryptVault(key, iv, tampered)).rejects.toThrow('主密码不正确或数据已损坏');
  });
});