import { useEffect, useState } from 'react';
import { deriveVaultKey } from '../crypto/kdf';
import { decryptVault } from '../crypto/vault';
import { useSession } from '../state/session';
import { useVaultStore } from '../state/vaultStore';
import {
  hasBackup,
  parseVaultFile,
  pickVaultFile,
  readVaultText,
  restoreBackup,
  vaultLocation,
  writeVaultText,
} from '../storage/vaultFile';

interface UnlockProps {
  onUnlocked: () => void;
}

export function Unlock({ onUnlocked }: UnlockProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState('');
  const [backupReady, setBackupReady] = useState(false);

  useEffect(() => {
    vaultLocation().then(setLocation).catch(() => setLocation(''));
    hasBackup().then(setBackupReady).catch(() => setBackupReady(false));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!password) {
      setError('请输入主密码');
      return;
    }
    setLoading(true);
    try {
      const text = await readVaultText();
      if (!text) {
        setError('找不到保险箱文件，请先创建或从备份导入');
        setLoading(false);
        return;
      }
      const file = parseVaultFile(text);
      const vaultKey = await deriveVaultKey(password, file.kdf.salt, file.kdf.iters);
      const doc = await decryptVault(vaultKey, file.iv, file.ct);

      useSession.getState().setSession({
        masterPassword: password,
        vaultKey,
        saltHex: file.kdf.salt,
        iters: file.kdf.iters,
      });
      useVaultStore.getState().loadDoc(doc);
      onUnlocked();
    } catch (e) {
      setError((e as Error).message || '解锁失败');
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setError('');
    try {
      const text = await pickVaultFile();
      if (!text) return;
      parseVaultFile(text);
      await writeVaultText(text);
      setPassword('');
      setError('已载入该文件，请输入它对应的主密码解锁');
    } catch (e) {
      setError(`导入失败：${(e as Error).message}`);
    }
  };

  const handleRestore = async () => {
    setError('');
    const ok = await restoreBackup();
    if (ok) {
      setError('已从上次写入前的备份恢复，请重新输入主密码');
    } else {
      setError('没有可用的备份');
    }
  };

  return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 var(--sp-xs)', fontWeight: 600, textAlign: 'center' }}>
          🔐 解锁 CipherVault
        </h1>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', textAlign: 'center', margin: '0 0 var(--sp-lg)', wordBreak: 'break-all' }}>
          数据位置：{location || '本地文件'}
        </p>

        <label style={labelStyle}>主密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          placeholder="输入你的主密码"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
        />

        {error && (
          <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', margin: 'var(--sp-sm) 0 0', lineHeight: 1.6 }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...primaryBtnStyle, marginTop: 'var(--sp-lg)', width: '100%', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '解锁中...' : '解锁'}
        </button>

        <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
          <button onClick={handleImport} style={ghostBtnStyle}>
            从保险箱文件导入
          </button>
          {backupReady && (
            <button onClick={handleRestore} style={ghostBtnStyle}>
              从备份恢复
            </button>
          )}
        </div>

        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', marginTop: 'var(--sp-lg)', lineHeight: 1.7 }}>
          主密码没有找回功能，也无法被任何人重置。建议把主密码记在纸上，收在安全的地方。
        </p>
      </div>
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  padding: 'var(--sp-lg)',
  background: 'var(--bg)',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r)',
  boxShadow: 'var(--shadow)',
  padding: 'var(--sp-xl)',
  maxWidth: 420,
  width: '100%',
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
  padding: '10px 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--fs)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--fs)',
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  background: 'var(--surface-2)',
  color: 'var(--dim)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--fs-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};
