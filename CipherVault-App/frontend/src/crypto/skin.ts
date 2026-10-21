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

export type RuleName = 'letter' | 'number' | 'poem';

export const RULE_LABELS: Record<RuleName, string> = {
  letter: '英文字母 A–P',
  number: '数字 10–25',
  poem: '古诗片段',
};

export const CUSTOM_SKIN_NAME = '自定义皮肤';

interface SkinRule {
  encode: (n: number) => string;
  decode: (s: string) => number;
}

const rules: Record<RuleName, SkinRule> = {
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
  return v === 'letter' || v === 'number' || v === 'poem';
}

export function normalizeRules(input: unknown): RuleName[] {
  if (!Array.isArray(input)) return ['letter'];
  const out = input.filter((v): v is RuleName => typeof v === 'string' && isRuleName(v));
  return out.length > 0 ? out : ['letter'];
}

export function encodeToken(ctHex: string, ruleNames: RuleName[]): string {
  const rulesList = normalizeRules(ruleNames).map((n) => rules[n]);
  const out: string[] = [];
  for (let i = 0; i < ctHex.length; i++) {
    const n = parseInt(ctHex[i], 16);
    const rule = rulesList[i % rulesList.length];
    out.push(rule.encode(n));
  }
  return out.join(SEP);
}

export function decodeToken(display: string, ruleNames: RuleName[]): string {
  const rulesList = normalizeRules(ruleNames).map((n) => rules[n]);
  const segs = display.split(SEP);
  let hex = '';
  for (let i = 0; i < segs.length; i++) {
    const rule = rulesList[i % rulesList.length];
    const v = rule.decode(segs[i]);
    if (v < 0 || v > 15) throw new Error(`第 ${i + 1} 段无法还原`);
    hex += v.toString(16);
  }
  return hex;
}