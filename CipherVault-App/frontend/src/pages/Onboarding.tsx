import { useState } from 'react';
import { scorePassword } from '../crypto/strength';
import { StrengthMeter } from '../components/StrengthMeter';

interface OnboardingProps {
  onComplete: (masterPassword: string) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'explain' | 'set'>('explain');

  const strength = scorePassword(pw);

  const handleNext = () => {
    setError('');
    if (pw.length < 6) {
      setError('主密码至少 6 个字符');
      return;
    }
    if (pw !== confirm) {
      setError('两次输入不一致');
      return;
    }
    onComplete(pw);
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
              <strong>主密码</strong>是你进入密码保险箱的<strong>唯一钥匙</strong>。
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>它用来加密你所存储的全部密码条目</li>
              <li>它<strong>不会</strong>被发送到任何服务器</li>
              <li><strong>没有</strong>"找回密码"功能 — 忘记主密码将永远无法访问你的数据</li>
              <li>请选择一个你自己能记住、别人猜不到的密码</li>
            </ul>
          </div>
          <button onClick={() => setStep('set')} style={primaryBtnStyle}>
            我理解了，开始设置
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

        <label style={labelStyle}>主密码</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={inputStyle}
          placeholder="至少 6 个字符"
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
        />

        {error && <p style={{ color: 'var(--bad)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-sm)' }}>{error}</p>}

        <button onClick={handleNext} style={{ ...primaryBtnStyle, marginTop: 'var(--sp-lg)', width: '100%' }}>
          创建保险箱
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