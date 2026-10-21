import { useState } from 'react';
import type { Entry } from '../api/types';
import { encodeToken } from '../crypto/skin';
import { keycardEncrypt } from '../crypto/stream';
import { bytesToHex } from '../lib/hex';
import { randomSalt16 } from '../crypto/kdf';
import { buildKeycardHtml } from '../keycard/buildHtml';
import { buildKeycardPy } from '../keycard/buildPy';
import { Modal } from './Modal';

interface CipherKeycardProps {
  entry: Entry;
  masterPassword: string;
  onClose: () => void;
}

type RuleName = 'letter' | 'number' | 'poem';

export function CipherKeycard({ entry, masterPassword, onClose }: CipherKeycardProps) {
  const [status, setStatus] = useState<'ready' | 'generating' | 'done'>('ready');
  const [error, setError] = useState('');
  const [displayStr, setDisplayStr] = useState('');

  const ctHex = entry.password
    .split('')
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  const display = status === 'done' ? displayStr : encodeToken(ctHex, entry.skin.rules as RuleName[]);

  const generate = async () => {
    setStatus('generating');
    setError('');
    try {
      const salt = randomSalt16();
      const iv = new Uint8Array(16);
      crypto.getRandomValues(iv);
      const iters = 200000;

      const { ct, tag } = await keycardEncrypt(masterPassword, entry.password, salt, iv, iters);

      const payload = {
        saltHex: bytesToHex(salt),
        ivHex: bytesToHex(iv),
        ctHex: bytesToHex(ct),
        tagHex: bytesToHex(tag),
        iters,
        display,
        skinName: entry.skin.name,
        entryName: entry.name,
      };

      setDisplayStr(display);

      const name = entry.name || 'entry';
      const html = buildKeycardHtml(payload, name, display);
      const py = buildKeycardPy(payload, name, display);

      downloadBlob(html, `keycard_${name}.html`, 'text/html');
      downloadBlob(py, `ciphervault_keycard_${name}.py`, 'text/plain');

      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('ready');
    }
  };

  return (
    <Modal open onClose={onClose} title="🔐 钥匙卡">
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', margin: '0 0 var(--sp-lg)' }}>
        将条目密码加密后生成可离线运行的 HTML 与 Python 文件。
      </p>

      <div
        style={{
          padding: 'var(--sp)',
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-sm)',
          fontSize: 'var(--fs)',
          fontFamily: 'var(--mono)',
          wordBreak: 'break-all',
          lineHeight: 1.8,
          marginBottom: 'var(--sp-lg)',
          maxHeight: 120,
          overflow: 'auto',
        }}
      >
        {display}
      </div>

      {error && (
        <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp)' }}>{error}</p>
      )}

      {status === 'done' && (
        <p style={{ color: 'var(--good)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp)' }}>
          ✅ 已生成并下载 keycard_{entry.name || 'entry'}.html 与 ciphervault_keycard_{(entry.name || 'entry')}.py
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnStyle}>关闭</button>
        {status !== 'done' && (
          <button
            onClick={generate}
            disabled={status === 'generating'}
            style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}
          >
            {status === 'generating' ? '生成中...' : '生成钥匙卡'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};