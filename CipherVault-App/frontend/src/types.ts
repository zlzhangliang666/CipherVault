export interface EntryKeycard {
  saltHex: string;
  ivHex: string;
  ctHex: string;
  tagHex: string;
  iters: number;
  display: string;
}

export interface Entry {
  id: string;
  name: string;
  account: string;
  password: string;
  category: string;
  notes: string;
  fav: boolean;
  ts: number;
  skin: { name: string; rules: Array<'letter' | 'number' | 'poem'> };
  /** 保存条目时预先生成的钥匙卡载荷；display 由密文生成，不含明文 */
  kc?: EntryKeycard;
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
