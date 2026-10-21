import { useState, useEffect, useCallback } from 'react';
import { useSession } from './state/session';
import { useVaultStore } from './state/vaultStore';
import { flush, startAutosave, stopAutosave } from './state/persistence';
import { vaultExists } from './storage/vaultFile';
import { Onboarding } from './pages/Onboarding';
import { Unlock } from './pages/Unlock';
import { Vault } from './pages/Vault';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';
import { ToastProvider, useToast } from './components/Toast';

function AppInner() {
  const locked = useSession((s) => s.vaultKey === null);
  const lock = useSession((s) => s.lock);
  const settings = useVaultStore((s) => s.settings);
  const { toast } = useToast();

  const [page, setPage] = useState<'vault' | 'settings' | 'help'>('vault');
  const [boot, setBoot] = useState<'checking' | 'new' | 'existing'>('checking');

  useEffect(() => {
    vaultExists()
      .then((exists) => setBoot(exists ? 'existing' : 'new'))
      .catch(() => setBoot('new'));
  }, []);

  // 解锁后自动保存：任何条目/设置变更都会在 400ms 后写回保险箱文件
  useEffect(() => {
    if (locked) return;
    startAutosave((message) => toast(`自动保存失败：${message}`, 'error'));
    return () => stopAutosave();
  }, [locked, toast]);

  // 自动锁定：解锁成功后立刻开始计时，任何操作都会重置
  useEffect(() => {
    if (locked) return;
    let timer: ReturnType<typeof setTimeout>;

    const doLock = async () => {
      try {
        await flush();
      } catch {
        // 落盘失败也要锁定，避免明文继续暴露
      }
      lock();
      toast('已自动锁定', 'info');
    };

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(doLock, Math.max(1, settings.autoLockMin) * 60 * 1000);
    };

    arm();
    window.addEventListener('mousemove', arm);
    window.addEventListener('keydown', arm);
    window.addEventListener('click', arm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('click', arm);
    };
  }, [locked, lock, settings.autoLockMin, toast]);

  // 窗口关闭前先落盘，再真正关闭
  useEffect(() => {
    const bridge = window.ciphervault;
    if (!bridge) return;
    bridge.onBeforeClose(async () => {
      try {
        await flush();
      } catch {
        // 关闭时即使保存失败也放行，避免应用无法退出
      }
      bridge.confirmClose();
    });
  }, []);

  const handleLock = useCallback(async () => {
    try {
      await flush();
    } catch {
      // 忽略落盘错误，锁定优先
    }
    lock();
    toast('已锁定', 'info');
  }, [lock, toast]);

  if (boot === 'checking') return null;

  if (locked) {
    if (boot === 'new') {
      return <Onboarding onComplete={() => setBoot('existing')} />;
    }
    return (
      <Unlock
        onUnlocked={() => {
          setPage('vault');
          setBoot('existing');
        }}
      />
    );
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
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', marginRight: 'var(--sp-sm)' }}>
          自动保存已开启
        </span>
        <button onClick={handleLock} style={lockBtnStyle}>
          🔒 锁定
        </button>
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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

const lockBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line-2)',
  background: 'var(--surface-2)',
  color: 'var(--dim)',
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
