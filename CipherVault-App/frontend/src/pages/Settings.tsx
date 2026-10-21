import { useState } from 'react';
import { useVaultStore } from '../state/vaultStore';
import { useSession } from '../state/session';
import { useToast } from '../components/Toast';

export function Settings() {
  const { settings, setSettings, getDoc, entries, categories } = useVaultStore();
  const { lock } = useSession();
  const { toast } = useToast();
  const [apiBase, setApiBase] = useState(
    localStorage.getItem('ciphervault_api_base') || import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1',
  );

  const handleExport = () => {
    const data = JSON.stringify(getDoc(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ciphervault-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('备份已下载', 'success');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const doc = JSON.parse(text);
        useVaultStore.getState().loadDoc(doc, 0);
        toast('数据已导入', 'success');
      } catch {
        toast('导入失败：文件格式不正确', 'error');
      }
    };
    input.click();
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--sp-xl)' }}>
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
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>剪贴板清空（秒）</label>
        <input
          type="number"
          value={settings.clipboardClearSec}
          min={5}
          max={300}
          onChange={(e) => setSettings({ clipboardClearSec: Math.max(5, parseInt(e.target.value) || 30) })}
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>API 地址</label>
        <input
          type="text"
          value={apiBase}
          onChange={(e) => {
            setApiBase(e.target.value);
            localStorage.setItem('ciphervault_api_base', e.target.value);
          }}
          style={inputStyle}
        />
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', margin: '4px 0 0' }}>
          修改后需刷新页面生效
        </p>
      </div>

      <div style={{ ...sectionStyle, display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <button onClick={handleExport} style={btnStyle}>
          📥 导出备份
        </button>
        <button onClick={handleImport} style={btnStyle}>
          📤 导入备份
        </button>
        <button
          onClick={() => lock()}
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
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};