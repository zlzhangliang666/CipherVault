import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEntryKeycard } from '../crypto/keycard';
import type { KeycardPayload } from '../crypto/stream';
import { buildKeycardPy } from '../keycard/buildPy';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function runPython(args: string[], env: Record<string, string> = {}): string {
  return execFileSync(PYTHON, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('导出的 Python 钥匙卡', () => {
  it('可编译、可导入，且能用主密码解出原始密码', async () => {
    const master = 'correct horse battery staple';
    const entryPassword = 'p@ssw0rd-中文';
    const kc = await createEntryKeycard(master, entryPassword, ['letter', 'poem', 'number']);
    const payload: KeycardPayload = { ...kc, skinName: '混合皮肤', entryName: 'Test' };

    const py = buildKeycardPy(payload, 'Test', kc.display);
    expect(py).not.toContain('\\\\n');

    const dir = mkdtempSync(join(tmpdir(), 'cv-keycard-'));
    const file = join(dir, 'keycard_test.py');
    writeFileSync(file, py, 'utf8');

    try {
      runPython(['-m', 'py_compile', file]);

      const script = [
        'import importlib.util, os, sys',
        `spec = importlib.util.spec_from_file_location("kc", ${JSON.stringify(file)})`,
        'm = importlib.util.module_from_spec(spec)',
        'spec.loader.exec_module(m)',
        'print(m.kc_decrypt(os.environ["CV_TEST_MASTER"]))',
        'try:',
        '    m.kc_decrypt("wrong-password")',
        '    print("NO_ERROR")',
        'except ValueError:',
        '    print("REJECTED")',
      ].join('\n');

      const out = runPython(['-c', script], { CV_TEST_MASTER: master });
      expect(out).toContain(entryPassword);
      expect(out).toContain('REJECTED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
