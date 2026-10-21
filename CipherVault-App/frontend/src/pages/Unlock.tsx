import { useState } from 'react';
import { getKdf, login, getVault, ApiError } from '../api/client';
import { deriveAuthHash, deriveVaultKey } from '../crypto/kdf';
import { decryptVault } from '../crypto/vault';
import { useSession } from '../state/session';
import { useVaultStore } from '../state/vaultStore';

interface UnlockProps {
  onUnlocked: () => void;
}

export function Unlock({ onUnlocked }: UnlockProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const setSession = useSession((s) => s.setSession);
  const loadDoc = useVaultStore((s) => s.loadDoc);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (!normalized || !password) {
        setError('请输入邮箱和主密码');
        setLoading(false);
        return;
      }

      if (mode === 'login') {
        // Get KDF salt
        const kdfData = await getKdf(normalized);
        const authHash = await deriveAuthHash(password, kdfData.kdfSalt, kdfData.kdfIters);
        const loginRes = await login(normalized, authHash);
        const vaultKey = await deriveVaultKey(password, kdfData.kdfSalt, kdfData.kdfIters);

        // Load vault
        let vaultDoc = null;
        let version = 0;
        try {
          const blob = await getVault(loginRes.token);
          if (blob) {
            vaultDoc = await decryptVault(vaultKey, blob.iv, blob.ct);
            version = blob.version;
          } else {
            // Empty vault - create a fresh one
            vaultDoc = { entries: [], categories: ['通用'], settings: { autoLockMin: 5, clipboardClearSec: 30 } };
            version = 0;
          }
        } catch (e) {
          if (e instanceof ApiError && e.code === 'VAULT_EMPTY') {
            vaultDoc = { entries: [], categories: ['通用'], settings: { autoLockMin: 5, clipboardClearSec: 30 } };
            version = 0;
          } else {
            throw e;
          }
        }

        setSession({
          masterPassword: password,
          token: loginRes.token,
          vaultKey,
          userId: loginRes.userId,
          email: normalized,
        });
        loadDoc(vaultDoc, version);
        onUnlocked();
      } else {
        // Register first
        setError('请先注册（尚未实现完整的注册流程，此按钮仅为演示）');
        setLoading(false);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError((e as Error).message);
      }
      setLoading(false);
    }
  };

  return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 var(--sp-lg)', fontWeight: 600, textAlign: 'center' }}>
          🔐 解锁 CipherVault
        </h1>

        <label style={labelStyle}>邮箱</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          placeholder="alice@example.com"
          autoFocus
        />

        <label style={labelStyle}>主密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          placeholder="输入你的主密码"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />

        {error && <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-sm)' }}>{error}</p>}

        <div style={{ marginTop: 'var(--sp-lg)', display: 'flex', gap: 'var(--sp-sm)' }}>
          {mode === 'login' ? (
            <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtnStyle, flex: 1 }}>
              {loading ? '解锁中...' : '解锁'}
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtnStyle, flex: 1 }}>
              注册
            </button>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--mute)', marginTop: 'var(--sp)' }}>
          {mode === 'login' ? (
            <>没有账号？<button onClick={() => setMode('register')} style={{ color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>注册</button></>
          ) : (
            <>已有账号？<button onClick={() => setMode('login')} style={{ color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>登录</button></>
          )}
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
  marginTop: 'var(--sp)',
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