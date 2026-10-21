import { useEffect, useState } from 'react';
import { useVaultStore } from '../state/vaultStore';
import { useSession } from '../state/session';
import { flush } from '../state/persistence';
import { useToast } from '../components/Toast';
import {
  hasBackup,
  parseVaultFile,
  pickVaultFile,
  readVaultText,
  restoreBackup,
  saveVaultCopy,
  vaultLocation,
  writeVaultText,
} from '../storage/vaultFile';

export function Settings() {
  const { settings, setSettings, entries, categories } = useVaultStore();
  const { lock } = useSession();
  const { toast } = useToast();
  const [location, setLocation] = useState('');
  const [backupReady, setBackupReady] = useState(false);

  useEffect(() => {
    vaultLocation().then(setLocation).catch(() => setLocation(''));
    hasBackup().then(setBackupReady).catch(() => setBackupReady(false));
  }, []);

  const handleExport = async () => {
    try {
      await flush();
      const text = await readVaultText();
      if (!text) {
        toast('还没有可导出的保险箱文件', 'error');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const ok = await saveVaultCopy(text, `ciphervault-backup-${stamp}.cvault`);
      if (ok) toast('加密备份已导出', 'success');
    } catch (e) {
      toast(`导出失败：${(e as Error).message}`, 'error');
    }
  };

  const handleImport = async () => {
    try {
      const text = await pickVaultFile();
      if (!text) return;
      parseVaultFile(text);
      await flush();
      await writeVaultText(text);
      lock();
      toast('已导入保险箱文件，请用该文件的主密码解锁', 'success');
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const ok = await restoreBackup();
      if (!ok) {
        toast('没有可用的备份', 'error');
        return;
      }
      lock();
      toast('已从备份恢复，请重新解锁', 'success');
    } catch (e) {
      toast(`恢复失败：${(e as Error).message}`, 'error');
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--sp-xl)' }}>
      <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, margin: '0 0 var(--sp-lg)' }}>设置</h1>

      <div style={sectionStyle}>
        <label style={labelStyle}>自动锁定（分钟）</label>
        <input
          type="number"
          value={settings.autoLockMin}
          min={1}
          max={120}
          onChange={(e) => setSettings({ autoLockMin: Math.max(1, parseInt(e.target.value) || 5) })}
          style={inputStyle}
        />
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', margin: '6px 0 0' }}>
          无操作达到该时长后自动锁定并清空内存中的明文。
        </p>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>保险箱文件位置</label>
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--fs-xs)',
            fontFamily: 'var(--mono)',
            wordBreak: 'break-all',
            color: 'var(--dim)',
          }}
        >
          {location || '读取中...'}
        </div>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', margin: '6px 0 0' }}>
          所有明文只存在于内存中，这里保存的是加密后的文件。
        </p>
      </div>

      <div style={{ ...sectionStyle, display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <button onClick={handleExport} style={btnStyle}>
          📥 导出加密备份
        </button>
        <button onClick={handleImport} style={btnStyle}>
          📤 从文件导入
        </button>
        {backupReady && (
          <button onClick={handleRestore} style={btnStyle}>
            ♻️ 恢复上次备份
          </button>
        )}
        <button
          onClick={() => void flush().finally(() => lock())}
          style={{ ...btnStyle, background: 'var(--warn)', color: '#fff', border: 'none' }}
        >
          🔒 锁定保险箱
        </button>
      </div>

      <div style={{ ...sectionStyle, borderTop: '1px solid var(--line)', paddingTop: 'var(--sp-lg)' }}>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)' }}>
          条目数：{entries.length} | 分类数：{categories.length}
        </p>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--sp-lg)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-xs)',
  fontWeight: 600,
  color: 'var(--dim)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--fs-sm)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  outline: 'none',
};

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
