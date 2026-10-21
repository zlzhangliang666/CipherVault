import { describe, it, expect } from 'vitest';
import { encodeToken, decodeToken, SEP } from '../crypto/skin';

describe('encodeToken / decodeToken', () => {
  it('letter skin roundtrip', () => {
    const ctHex = '0123456789abcdef';
    const display = encodeToken(ctHex, ['letter']);
    expect(decodeToken(display, ['letter'])).toBe(ctHex);
  });

  it('number skin roundtrip', () => {
    const ctHex = '0123456789abcdef';
    const display = encodeToken(ctHex, ['number']);
    expect(decodeToken(display, ['number'])).toBe(ctHex);
  });

  it('poem skin roundtrip', () => {
    const ctHex = '0123456789abcdef';
    const display = encodeToken(ctHex, ['poem']);
    expect(decodeToken(display, ['poem'])).toBe(ctHex);
  });

  it('mixed skin roundtrip', () => {
    const ctHex = '0123456789abcdef';
    const display = encodeToken(ctHex, ['letter', 'poem', 'number']);
    expect(decodeToken(display, ['letter', 'poem', 'number'])).toBe(ctHex);
  });

  it('decodeToken throws on invalid letter segment', () => {
    expect(() => decodeToken(`X${SEP}A${SEP}B`, ['letter'])).toThrow('无法还原');
  });

  it('decodeToken throws on invalid number segment', () => {
    expect(() => decodeToken(`10${SEP}99${SEP}12`, ['number'])).toThrow('无法还原');
  });

  it('decodeToken throws on invalid poem segment', () => {
    expect(() => decodeToken(`床前明月光${SEP}不存在的诗${SEP}举头望明月`, ['poem'])).toThrow('无法还原');
  });

  it('encode followed by decode returns original ctHex with mixed rules', () => {
    const ctHex = 'a1b2c3d4e5f60789abcdef01234567';
    const rules: Array<'letter' | 'number' | 'poem'> = ['letter', 'poem', 'number'];
    const display = encodeToken(ctHex, rules);
    expect(decodeToken(display, rules)).toBe(ctHex);
  });
});