import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from './state/session';
import { useVaultStore } from './state/vaultStore';
import { encryptVault } from './crypto/vault';
import { putVault, ApiError } from './api/client';
import { Onboarding } from './pages/Onboarding';
import { Unlock } from './pages/Unlock';
import { Vault } from './pages/Vault';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';
import { ToastProvider } from './components/Toast';
import { useToast } from './components/Toast';

function AppInner() {
  const { isLocked, vaultKey, token, masterPassword, lock } = useSession();
  const { getDoc, version, settings } = useVaultStore();
  const { toast } = useToast();
  const [page, setPage] = useState<'vault' | 'settings' | 'help'>('vault');
  const [lockTimer, setLockTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const lockTimerRef = useRef(lockTimer);
  lockTimerRef.current = lockTimer;

  const locked = isLocked();

  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (!locked) {
      const t = setTimeout(() => {
        lock();
        toast('已自动锁定', 'info');
      }, settings.autoLockMin * 60 * 1000);
      setLockTimer(t);
    }
  }, [locked, lock, settings.autoLockMin, toast]);

  useEffect(() => {
    resetLockTimer();
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleActivity = () => resetLockTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [resetLockTimer]);

  const handleOnboardingComplete = async (_pw: string) => {
    toast('注册功能需要后端支持。请先启动后端并使用 Unlock 页面登录。', 'info');
  };

  const handleUnlocked = () => {
    setPage('vault');
  };

  const handleSync = useCallback(async () => {
    if (!token || !vaultKey || !masterPassword) return;
    try {
      const doc = getDoc();
      const { iv, ct } = await encryptVault(vaultKey, doc);
      const res = await putVault(token, { baseVersion: version, iv, ct });
      useVaultStore.setState({ version: res.version });
      toast('同步成功', 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        toast('版本冲突！请先刷新数据再试。', 'error');
      } else {
        toast(`同步失败：${(e as Error).message}`, 'error');
      }
    }
  }, [token, vaultKey, masterPassword, version, getDoc, toast]);

  if (locked) {
    // Check if user has been onboarded (has email in session)
    const { email } = useSession.getState();
    if (!email) {
      return <Onboarding onComplete={handleOnboardingComplete} />;
    }
    return <Unlock onUnlocked={handleUnlocked} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav
        style={{
          display: 'flex',
          gap: 'var(--sp)',
          padding: 'var(--sp-sm) var(--sp-lg)',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', marginRight: 'var(--sp-lg)' }}>
          🔐 CipherVault
        </span>
        <button
          onClick={() => setPage('vault')}
          style={{
            ...navBtnStyle,
            fontWeight: page === 'vault' ? 700 : 400,
            color: page === 'vault' ? 'var(--accent)' : 'var(--dim)',
          }}
        >
          保险箱
        </button>
        <button
          onClick={() => setPage('settings')}
          style={{
            ...navBtnStyle,
            fontWeight: page === 'settings' ? 700 : 400,
            color: page === 'settings' ? 'var(--accent)' : 'var(--dim)',
          }}
        >
          设置
        </button>
        <button
          onClick={() => setPage('help')}
          style={{
            ...navBtnStyle,
            fontWeight: page === 'help' ? 700 : 400,
            color: page === 'help' ? 'var(--accent)' : 'var(--dim)',
          }}
        >
          帮助
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSync} style={syncBtnStyle}>
          🔄 同步
        </button>
      </nav>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {page === 'vault' && <Vault />}
        {page === 'settings' && <Settings />}
        {page === 'help' && <Help />}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'none',
  fontSize: 'var(--fs-sm)',
  cursor: 'pointer',
};

const syncBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  fontSize: 'var(--fs-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}