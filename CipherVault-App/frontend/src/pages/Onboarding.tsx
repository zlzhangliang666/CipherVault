import { useState } from 'react';
import { scorePassword } from '../crypto/strength';
import { StrengthMeter } from '../components/StrengthMeter';
import { bytesToHex } from '../lib/hex';
import { deriveVaultKey, randomSalt16 } from '../crypto/kdf';
import { encryptVault } from '../crypto/vault';
import { writeVaultText, isDesktop, VAULT_FORMAT } from '../storage/vaultFile';
import { useSession } from '../state/session';
import { useVaultStore } from '../state/vaultStore';
import type { VaultDoc } from '../types';

const NEW_VAULT_ITERS = 200_000;

const emptyDoc: VaultDoc = {
  entries: [],
  categories: ['通用'],
  settings: { autoLockMin: 5, clipboardClearSec: 30 },
};

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'explain' | 'set'>('explain');

  const strength = scorePassword(pw);

  const createVault = async () => {
    setError('');
    if (pw.length < 6) {
      setError('主密码至少 6 个字符');
      return;
    }
    if (pw !== confirm) {
      setError('两次输入不一致');
      return;
    }
    setBusy(true);
    try {
      const saltHex = bytesToHex(randomSalt16());
      const vaultKey = await deriveVaultKey(pw, saltHex, NEW_VAULT_ITERS);
      const { iv, ct } = await encryptVault(vaultKey, emptyDoc);

      await writeVaultText(
        JSON.stringify(
          {
            format: VAULT_FORMAT,
            formatVersion: 1,
            kdf: { salt: saltHex, iters: NEW_VAULT_ITERS },
            iv,
            ct,
          },
          null,
          2,
        ),
      );

      useSession.getState().setSession({
        masterPassword: pw,
        vaultKey,
        saltHex,
        iters: NEW_VAULT_ITERS,
      });
      useVaultStore.getState().loadDoc(emptyDoc);
      onComplete();
    } catch (e) {
      setError(`创建失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'explain') {
    return (
      <div style={centerStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 'var(--fs-xxl)', margin: '0 0 var(--sp-lg)', fontWeight: 700 }}>
            🔐 欢迎使用 CipherVault
          </h1>
          <div style={{ color: 'var(--dim)', lineHeight: 1.8, marginBottom: 'var(--sp-lg)' }}>
            <p style={{ margin: '0 0 var(--sp)' }}>
              这是一款<strong>完全离线</strong>的密码保险箱：所有数据都加密存放在
              {isDesktop() ? '你电脑上的一个文件里' : '本机浏览器中'}，不联网、不上传。
            </p>
            <p style={{ margin: '0 0 var(--sp)' }}>
              第一次使用需要你设置一个<strong>主密码</strong>，它就是打开保险箱的唯一钥匙：
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>它用来加密你所存储的全部密码条目</li>
              <li>它<strong>不会</strong>被保存在任何地方，也没有服务器能替你保管</li>
              <li><strong>没有</strong>"找回密码"功能 —— 忘记主密码将永远无法打开保险箱</li>
              <li>建议用一句只有你知道的长句子，既好记又难猜</li>
            </ul>
          </div>
          <button onClick={() => setStep('set')} style={primaryBtnStyle}>
            我理解了，设置主密码
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 var(--sp-lg)', fontWeight: 600 }}>
          设置你的主密码
        </h1>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', margin: '0 0 var(--sp-lg)' }}>
          设置完成后会在这台电脑上创建一个加密的保险箱文件。
        </p>

        <label style={labelStyle}>主密码</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={inputStyle}
          placeholder="至少 6 个字符，建议一句长句子"
          autoFocus
        />
        <div style={{ marginTop: 4, marginBottom: 'var(--sp)' }}>
          <StrengthMeter score={strength.score} label={strength.label} />
        </div>

        <label style={labelStyle}>确认主密码</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
          placeholder="再次输入"
          onKeyDown={(e) => e.key === 'Enter' && !busy && createVault()}
        />

        {error && (
          <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-sm)' }}>{error}</p>
        )}

        <button
          onClick={createVault}
          disabled={busy}
          style={{ ...primaryBtnStyle, marginTop: 'var(--sp-lg)', width: '100%', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '正在创建加密保险箱...' : '创建保险箱'}
        </button>
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
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r)',
  boxShadow: 'var(--shadow)',
  padding: 'var(--sp-xl)',
  maxWidth: 480,
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
  marginBottom: 'var(--sp)',
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
