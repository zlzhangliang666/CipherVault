import { useState } from 'react';
import type { Entry, EntryKeycard } from '../types';
import { createEntryKeycard } from '../crypto/keycard';
import type { KeycardPayload } from '../crypto/stream';
import { buildKeycardHtml } from '../keycard/buildHtml';
import { buildKeycardPy } from '../keycard/buildPy';
import { Modal } from './Modal';

interface CipherKeycardProps {
  entry: Entry;
  masterPassword: string;
  onClose: () => void;
}

export function CipherKeycard({ entry, masterPassword, onClose }: CipherKeycardProps) {
  const [status, setStatus] = useState<'ready' | 'generating' | 'done'>('ready');
  const [error, setError] = useState('');
  const [kc, setKc] = useState<EntryKeycard | null>(entry.kc ?? null);

  const display = kc?.display ?? '';

  const generate = async () => {
    if (!entry.password) {
      setError('请先填写密码再生成钥匙卡');
      return;
    }
    setStatus('generating');
    setError('');
    try {
      const payloadKc =
        kc ?? (await createEntryKeycard(masterPassword, entry.password, entry.skin.rules));
      setKc(payloadKc);

      const payload: KeycardPayload = {
        ...payloadKc,
        skinName: entry.skin.name,
        rules: entry.skin.rules,
        entryName: entry.name,
      };

      const name = entry.name || 'entry';
      const html = buildKeycardHtml(payload, name, payloadKc.display);
      const py = buildKeycardPy(payload, name, payloadKc.display);

      downloadBlob(html, `keycard_${safeName(name)}.html`, 'text/html');
      downloadBlob(py, `ciphervault_keycard_${safeName(name)}.py`, 'text/plain');

      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('ready');
    }
  };

  return (
    <Modal open onClose={onClose} title="🔐 钥匙卡">
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', margin: '0 0 var(--sp-lg)' }}>
        把条目密码用主密码加密后，生成可离线运行的 HTML 与 Python 文件。趣味显示由密文编码，不含明文。
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
          color: 'var(--dim)',
        }}
      >
        {display || '生成后显示'}
      </div>

      {error && (
        <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp)' }}>{error}</p>
      )}

      {status === 'done' && (
        <p style={{ color: 'var(--good)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp)' }}>
          ✅ 已下载 keycard_{entry.name || 'entry'}.html 与 ciphervault_keycard_{entry.name || 'entry'}.py
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnStyle}>关闭</button>
        {status !== 'done' && (
          <button
            onClick={generate}
            disabled={status === 'generating'}
            style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', border: 'none' }}
          >
            {status === 'generating' ? '生成中...' : '生成钥匙卡'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'entry';
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
  color: 'var(--txt)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};
