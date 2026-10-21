export interface EntryKeycard {
  saltHex: string;
  ivHex: string;
  ctHex: string;
  tagHex: string;
  iters: number;
  display: string;
}

export type SkinRuleName = 'letter' | 'number' | 'poem' | 'custom';

export interface EntrySkin {
  name: string;
  rules: SkinRuleName[];
  /** custom 为 16 个用户自定义文字，依次对应十六进制 0–F */
  custom?: string[];
}

/** 一个账号下的一项加密值（密码、API Key、恢复码等） */
export interface EntryValue {
  id: string;
  label: string;
  value: string;
  skin: EntrySkin;
  /** 保存/实时预览生成的钥匙卡载荷；display 由密文生成，不含明文 */
  kc?: EntryKeycard;
}

export interface Entry {
  id: string;
  name: string;
  account: string;
  category: string;
  notes: string;
  fav: boolean;
  ts: number;
  values: EntryValue[];
}

export interface VaultDoc {
  entries: Entry[];
  categories: string[];
  settings: {
    autoLockMin: number;
    clipboardClearSec: number;
  };
}

/** 落盘的本地保险箱文件结构 */
export interface VaultFile {
  format: 'ciphervault/vault';
  formatVersion: 1;
  kdf: { salt: string; iters: number };
  iv: string;
  ct: string;
}
