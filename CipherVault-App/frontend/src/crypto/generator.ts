interface GenOpts {
  length?: number;
  upper?: boolean;
  lower?: boolean;
  digits?: boolean;
  symbols?: boolean;
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';

export function generatePassword(opts: GenOpts = {}): string {
  const length = opts.length ?? 16;
  const upper = opts.upper ?? true;
  const lower = opts.lower ?? true;
  const digits = opts.digits ?? true;
  const symbols = opts.symbols ?? true;

  let charset = '';
  if (upper) charset += UPPER;
  if (lower) charset += LOWER;
  if (digits) charset += DIGITS;
  if (symbols) charset += SYMBOLS;
  if (!charset) charset = LOWER + DIGITS;

  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[buf[i] % charset.length];
  }
  return out;
}