import { describe, it, expect } from 'vitest';
import { deriveDk, deriveAuthHash, deriveVaultKey } from './kdf';
import { keycardEncrypt, keycardDecrypt } from './stream';
import { encodeToken, decodeToken } from './skin';
import { bytesToHex } from '../lib/hex';

// Read vectors from the shared file
import vectors from '../../../packages/ciphervault-core/vectors.json';

type RuleName = 'letter' | 'number' | 'poem';

interface VectorEntry {
  name: string;
  note: string;
  masterPassword: string;
  entryPassword: string;
  saltHex: string;
  ivHex: string;
  iters: number;
  authHashHex: string;
  vaultKeyHex: string;
  ctHex: string;
  tagHex: string;
  display: string;
  skin: {
    name: string;
    rules: RuleName[];
    poems: string[];
    sep: string;
  };
}

const typedVectors = vectors as VectorEntry[];

describe('cross-language vectors', () => {
  for (const vec of typedVectors) {
    describe(vec.name, () => {
      it('derives correct vaultKey and authHash', async () => {
        const dk = await deriveDk(vec.masterPassword, vec.saltHex, vec.iters);
        expect(bytesToHex(dk.slice(0, 32))).toBe(vec.vaultKeyHex);
        expect(bytesToHex(dk.slice(32, 64))).toBe(vec.authHashHex);

        const vaultKey = await deriveVaultKey(vec.masterPassword, vec.saltHex, vec.iters);
        expect(bytesToHex(vaultKey)).toBe(vec.vaultKeyHex);

        const authHash = await deriveAuthHash(vec.masterPassword, vec.saltHex, vec.iters);
        expect(authHash).toBe(vec.authHashHex);
      });

      it('decrypts ctHex+tagHex with masterPassword → entryPassword', async () => {
        const decrypted = await keycardDecrypt(
          vec.masterPassword,
          vec.saltHex,
          vec.ivHex,
          vec.ctHex,
          vec.tagHex,
          vec.iters,
        );
        expect(decrypted).toBe(vec.entryPassword);
      });

      it('wrong masterPassword is rejected by tag check', async () => {
        await expect(
          keycardDecrypt(
            'wrong-password',
            vec.saltHex,
            vec.ivHex,
            vec.ctHex,
            vec.tagHex,
            vec.iters,
          ),
        ).rejects.toThrow('主密码不正确');
      });

      it('encrypts entryPassword with fixed salt/iv → matches ctHex and tagHex', async () => {
        const { ct, tag } = await keycardEncrypt(
          vec.masterPassword,
          vec.entryPassword,
          new Uint8Array(vec.saltHex.match(/../g)!.map((b) => parseInt(b, 16))),
          new Uint8Array(vec.ivHex.match(/../g)!.map((b) => parseInt(b, 16))),
          vec.iters,
        );
        expect(bytesToHex(ct)).toBe(vec.ctHex);
        expect(bytesToHex(tag)).toBe(vec.tagHex);
      });

      it('encodeToken(ctHex, rules) matches display and decodeToken roundtrips', () => {
        const display = encodeToken(vec.ctHex, vec.skin.rules);
        expect(display).toBe(vec.display);

        const roundtrip = decodeToken(vec.display, vec.skin.rules);
        expect(roundtrip).toBe(vec.ctHex);
      });
    });
  }
});