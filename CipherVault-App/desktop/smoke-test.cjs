'use strict';

// 桌面壳本地存储冒烟测试：node smoke-test.cjs
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const storage = require('./storage.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciphervault-smoke-'));
storage.init(dir);

assert.strictEqual(storage.exists(), false, '初始状态不应存在保险箱');

const bad = storage.write('{"nope":true}');
assert.strictEqual(bad.ok, false, '非法文件必须被拒绝');

const payload = {
  format: 'ciphervault/vault',
  formatVersion: 1,
  kdf: { salt: 'a'.repeat(32), iters: 200000 },
  iv: 'b'.repeat(24),
  ct: 'c'.repeat(32),
};
const text = JSON.stringify(payload);

const written = storage.write(text);
assert.strictEqual(written.ok, true, '合法文件应写入成功');
assert.strictEqual(storage.exists(), true, '写入后应存在保险箱');

const readBack = storage.read();
assert.strictEqual(readBack.ok, true, '应能读回');
assert.deepStrictEqual(JSON.parse(readBack.text), payload, '读回内容必须一致');

// 第二次写入应产生 .bak 备份
storage.write(JSON.stringify({ ...payload, ct: 'd'.repeat(32) }));
assert.strictEqual(storage.backupExists(), true, '覆盖写入应生成备份');

// 模拟损坏文件：应能回滚到备份
fs.writeFileSync(path.join(dir, 'vault.cvault'), 'broken');
assert.strictEqual(storage.read().ok, false, '损坏文件应读取失败');
assert.strictEqual(storage.restoreBackup().ok, true, '备份应可恢复');
assert.strictEqual(storage.read().ok, true, '恢复后应能读取');

fs.rmSync(dir, { recursive: true, force: true });
console.log('desktop storage smoke test passed');
