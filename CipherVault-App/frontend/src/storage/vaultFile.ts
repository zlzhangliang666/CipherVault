import type { VaultFile } from '../types';

export const VAULT_FORMAT = 'ciphervault/vault';
export const MIN_ITERS = 10_000;
export const MAX_ITERS = 2_000_000;

const LS_KEY = 'ciphervault_vault_file';

function bridge() {
  return window.ciphervault;
}

export function isDesktop(): boolean {
  return Boolean(bridge()?.isDesktop);
}

/** 读取本地保险箱原始文本；不存在返回 null */
export async function readVaultText(): Promise<string | null> {
  const b = bridge();
  if (b) {
    const res = await b.readVault();
    return res.ok && res.text ? res.text : null;
  }
  return localStorage.getItem(LS_KEY);
}

export async function vaultExists(): Promise<boolean> {
  const b = bridge();
  if (b) return b.vaultExists();
  return localStorage.getItem(LS_KEY) !== null;
}

/** 覆盖写入本地保险箱（桌面走原子写，浏览器走 localStorage） */
export async function writeVaultText(text: string): Promise<void> {
  const b = bridge();
  if (b) {
    const res = await b.writeVault(text);
    if (!res.ok) throw new Error(res.error || '写入保险箱失败');
    return;
  }
  localStorage.setItem(LS_KEY, text);
}

/** 另存一份加密备份（不含明文），取消返回 false */
export async function saveVaultCopy(text: string, suggestedName: string): Promise<boolean> {
  const b = bridge();
  if (b) {
    const res = await b.saveAs(text, suggestedName);
    return res.ok;
  }
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** 选择并读取一个保险箱文件，取消返回 null */
export async function pickVaultFile(): Promise<string | null> {
  const b = bridge();
  if (b) {
    const res = await b.openVault();
    return res.ok && res.text ? res.text : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cvault,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function vaultLocation(): Promise<string> {
  const b = bridge();
  if (b) return b.vaultPath();
  return '浏览器本地存储（localStorage）';
}

export async function hasBackup(): Promise<boolean> {
  const b = bridge();
  return b ? b.backupExists() : false;
}

export async function restoreBackup(): Promise<boolean> {
  const b = bridge();
  if (!b) return false;
  const res = await b.restoreBackup();
  return res.ok;
}

const HEX_RE = /^[0-9a-f]+$/;

/** 校验并解析保险箱文件，防止损坏或恶意文件把参数设成极端值 */
export function parseVaultFile(text: string): VaultFile {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  const f = obj as Partial<VaultFile>;
  if (!f || f.format !== VAULT_FORMAT) throw new Error('不是 CipherVault 保险箱文件');
  if (f.formatVersion !== 1) throw new Error('不支持的保险箱文件版本');
  if (!f.kdf || typeof f.kdf.salt !== 'string' || !HEX_RE.test(f.kdf.salt) || f.kdf.salt.length !== 32) {
    throw new Error('保险箱文件的 salt 无效');
  }
  if (typeof f.kdf.iters !== 'number' || f.kdf.iters < MIN_ITERS || f.kdf.iters > MAX_ITERS) {
    throw new Error('保险箱文件的迭代次数无效');
  }
  if (typeof f.iv !== 'string' || !HEX_RE.test(f.iv) || f.iv.length !== 24) {
    throw new Error('保险箱文件的 iv 无效');
  }
  if (typeof f.ct !== 'string' || !HEX_RE.test(f.ct) || f.ct.length === 0) {
    throw new Error('保险箱文件的密文无效');
  }
  return f as VaultFile;
}
