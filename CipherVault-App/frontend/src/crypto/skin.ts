export const SEP = '\u00b7';

export const POEMS = [
  '床前明月光',
  '疑是地上霜',
  '举头望明月',
  '低头思故乡',
  '春眠不觉晓',
  '处处闻啼鸟',
  '夜来风雨声',
  '花落知多少',
  '白日依山尽',
  '黄河入海流',
  '欲穷千里目',
  '更上一层楼',
  '锄禾日当午',
  '汗滴禾下土',
  '谁知盘中餐',
  '粒粒皆辛苦',
];

export type RuleName = 'letter' | 'number' | 'poem' | 'custom';

export const RULE_LABELS: Record<RuleName, string> = {
  letter: '英文字母 A–P',
  number: '数字 10–25',
  poem: '古诗片段',
  custom: '自定义文字',
};

export const CUSTOM_SKIN_NAME = '自定义皮肤';

export const CUSTOM_ALPHABET_SIZE = 16;

/** 默认自定义文字表，依次对应十六进制 0–F */
export const DEFAULT_CUSTOM_ALPHABET: string[] = [
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛',
  '壬', '癸', '子', '丑', '寅', '卯', '辰', '巳',
];

interface SkinRule {
  encode: (n: number) => string;
  decode: (s: string) => number;
}

const rules: Record<Exclude<RuleName, 'custom'>, SkinRule> = {
  letter: {
    encode: (n) => String.fromCharCode(65 + n),
    decode: (s) => {
      const v = s.charCodeAt(0) - 65;
      if (v < 0 || v > 15) throw new Error('字母越界，无法还原');
      return v;
    },
  },
  number: {
    encode: (n) => String(n + 10),
    decode: (s) => {
      const v = parseInt(s, 10) - 10;
      if (v < 0 || v > 15) throw new Error('数字越界，无法还原');
      return v;
    },
  },
  poem: {
    encode: (n) => POEMS[n],
    decode: (s) => {
      const idx = POEMS.indexOf(s);
      if (idx < 0) throw new Error('古诗片段无法还原');
      return idx;
    },
  },
};

export const XF = rules;

export const BUILTIN_SKINS: { name: string; rules: RuleName[] }[] = [
  { name: '字母皮肤', rules: ['letter'] },
  { name: '古诗皮肤', rules: ['poem'] },
  { name: '数字皮肤', rules: ['number'] },
  { name: '混合皮肤', rules: ['letter', 'poem', 'number'] },
];

export function isRuleName(v: string): v is RuleName {
  return v === 'letter' || v === 'number' || v === 'poem' || v === 'custom';
}

export function normalizeRules(input: unknown): RuleName[] {
  if (!Array.isArray(input)) return ['letter'];
  const out = input.filter((v): v is RuleName => typeof v === 'string' && isRuleName(v));
  return out.length > 0 ? out : ['letter'];
}

/** 校验自定义文字表；返回错误文案，合法时返回 null */
export function customAlphabetError(input: string[]): string | null {
  if (input.length !== CUSTOM_ALPHABET_SIZE) {
    return `需要填写 ${CUSTOM_ALPHABET_SIZE} 个文字（对应 0–F）`;
  }
  if (input.some((v) => !v.trim())) return '每个值都需要填写文字';
  if (input.some((v) => v.includes(SEP))) return '自定义文字不能包含分隔符 ·';
  if (new Set(input.map((v) => v.trim())).size !== CUSTOM_ALPHABET_SIZE) {
    return '自定义文字不能重复';
  }
  return null;
}

export function normalizeCustomAlphabet(input: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(input)) {
    for (let i = 0; i < CUSTOM_ALPHABET_SIZE; i++) {
      const v = typeof input[i] === 'string' ? (input[i] as string).trim() : '';
      out.push(v || DEFAULT_CUSTOM_ALPHABET[i]);
    }
  } else {
    return [...DEFAULT_CUSTOM_ALPHABET];
  }
  return customAlphabetError(out) ? [...DEFAULT_CUSTOM_ALPHABET] : out;
}

function resolveRule(name: RuleName, custom: string[]): SkinRule {
  if (name === 'custom') {
    return {
      encode: (n) => custom[n],
      decode: (s) => custom.indexOf(s),
    };
  }
  return rules[name];
}

export function encodeToken(ctHex: string, ruleNames: RuleName[], customInput?: string[]): string {
  const list = normalizeRules(ruleNames);
  const custom = normalizeCustomAlphabet(customInput);
  const resolved = list.map((n) => resolveRule(n, custom));
  const out: string[] = [];
  for (let i = 0; i < ctHex.length; i++) {
    const n = parseInt(ctHex[i], 16);
    out.push(resolved[i % resolved.length].encode(n));
  }
  return out.join(SEP);
}

export function decodeToken(display: string, ruleNames: RuleName[], customInput?: string[]): string {
  const list = normalizeRules(ruleNames);
  const custom = normalizeCustomAlphabet(customInput);
  const resolved = list.map((n) => resolveRule(n, custom));
  const segs = display.split(SEP);
  let hex = '';
  for (let i = 0; i < segs.length; i++) {
    const v = resolved[i % resolved.length].decode(segs[i]);
    if (v < 0 || v > 15) throw new Error(`第 ${i + 1} 段无法还原`);
    hex += v.toString(16);
  }
  return hex;
}