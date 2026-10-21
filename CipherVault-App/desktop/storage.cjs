'use strict';

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'vault.cvault';
const BACKUP_NAME = 'vault.cvault.bak';
const MAX_BYTES = 20 * 1024 * 1024;

let baseDir = '';
let filePath = '';

function init(dir) {
  baseDir = dir;
  filePath = path.join(dir, FILE_NAME);
  fs.mkdirSync(dir, { recursive: true });
}

function getPath() {
  return filePath;
}

function exists() {
  return filePath !== '' && fs.existsSync(filePath);
}

function validate(text) {
  if (typeof text !== 'string') throw new Error('写入内容必须是字符串');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('保险箱文件超过 20 MB');
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON');
  }
  if (
    !obj ||
    obj.format !== 'ciphervault/vault' ||
    typeof obj.iv !== 'string' ||
    typeof obj.ct !== 'string' ||
    !obj.kdf ||
    typeof obj.kdf.salt !== 'string'
  ) {
    throw new Error('不是 CipherVault 保险箱文件');
  }
  return text;
}

function atomicWrite(target, text) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
  if (fs.existsSync(target)) {
    try {
      fs.copyFileSync(target, path.join(path.dirname(target), BACKUP_NAME));
    } catch {
      // 备份失败不阻断主写入
    }
  }
  fs.renameSync(tmp, target);
}

function read() {
  if (!exists()) return { ok: false, code: 'NOT_FOUND' };
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    validate(text);
    return { ok: true, text, path: filePath };
  } catch (e) {
    return { ok: false, code: 'READ_FAILED', error: e.message };
  }
}

function write(text) {
  try {
    validate(text);
    atomicWrite(filePath, text);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, code: 'WRITE_FAILED', error: e.message };
  }
}

function writeAs(target, text) {
  try {
    validate(text);
    atomicWrite(target, text);
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, code: 'WRITE_FAILED', error: e.message };
  }
}

function readFrom(target) {
  try {
    const stat = fs.statSync(target);
    if (stat.size > MAX_BYTES) return { ok: false, code: 'TOO_LARGE' };
    const text = fs.readFileSync(target, 'utf8');
    validate(text);
    return { ok: true, text, name: path.basename(target) };
  } catch (e) {
    return { ok: false, code: 'READ_FAILED', error: e.message };
  }
}

function backupPath() {
  return path.join(baseDir, BACKUP_NAME);
}

function backupExists() {
  return fs.existsSync(backupPath());
}

function restoreBackup() {
  if (!backupExists()) return { ok: false, code: 'NO_BACKUP' };
  try {
    fs.copyFileSync(backupPath(), filePath);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, code: 'RESTORE_FAILED', error: e.message };
  }
}

module.exports = {
  init,
  getPath,
  exists,
  read,
  write,
  writeAs,
  readFrom,
  backupExists,
  restoreBackup,
};
