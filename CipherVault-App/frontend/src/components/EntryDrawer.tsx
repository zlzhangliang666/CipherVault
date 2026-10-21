import { useState, useEffect } from 'react';
import type { Entry } from '../types';
import { scorePassword } from '../crypto/strength';
import { StrengthMeter } from './StrengthMeter';
import { generatePassword } from '../crypto/generator';
import { BUILTIN_SKINS } from '../crypto/skin';

interface EntryDrawerProps {
  entry: Entry | null;
  categories: string[];
  onSave: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  openKeycard: (entry: Entry) => void;
}

const emptyEntry: Entry = {
  id: '',
  name: '',
  account: '',
  password: '',
  category: '通用',
  notes: '',
  fav: false,
  ts: Date.now(),
  skin: { name: '字母皮肤', rules: ['letter'] },
};

export function EntryDrawer({ entry, categories, onSave, onDelete, onClose, openKeycard }: EntryDrawerProps) {
  const [draft, setDraft] = useState<Entry>(entry ?? { ...emptyEntry, id: '' });
  const isNew = !entry;

  useEffect(() => {
    setDraft(entry ?? { ...emptyEntry, id: '' });
  }, [entry]);

  const strength = scorePassword(draft.password);
  const display = draft.kc?.display ?? '';

  const handleSave = () => {
    onSave({ ...draft, ts: Date.now() });
  };

  const handleGenPw = () => {
    setDraft((d) => ({ ...d, password: generatePassword(), kc: undefined }));
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 400,
        maxWidth: '100vw',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: 'var(--sp-lg)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600 }}>
          {isNew ? '新建条目' : '编辑条目'}
        </h3>
        <button onClick={onClose} style={{ fontSize: 18, color: 'var(--mute)', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--sp)' }}>
        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>名称</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          style={inputStyle}
          placeholder="如：GitHub"
        />

        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>账号</label>
        <input
          value={draft.account}
          onChange={(e) => setDraft((d) => ({ ...d, account: e.target.value }))}
          style={inputStyle}
          placeholder="user@example.com"
        />

        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>密码</label>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <input
            value={draft.password}
            onChange={(e) =>
              setDraft((d) => ({ ...d, password: e.target.value, kc: undefined }))
            }
            style={{ ...inputStyle, flex: 1 }}
            placeholder="输入或生成密码"
          />
          <button onClick={handleGenPw} style={smallBtnStyle}>生成</button>
          <button onClick={() => openKeycard(draft)} style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--accent)' }}>
            钥匙卡
          </button>
        </div>
        <StrengthMeter score={strength.score} label={strength.label} />

        {draft.password && (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', wordBreak: 'break-all', lineHeight: 1.6 }}>
            {display || '保存后生成趣味显示（由密文编码，不含明文）'}
          </div>
        )}

        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>分类</label>
        <select
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          style={inputStyle}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>皮肤</label>
        <select
          value={draft.skin.name}
          onChange={(e) => {
            const skin = BUILTIN_SKINS.find((s) => s.name === e.target.value);
            if (skin)
              setDraft((d) => ({ ...d, skin: { name: skin.name, rules: skin.rules }, kc: undefined }));
          }}
          style={inputStyle}
        >
          {BUILTIN_SKINS.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>

        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>备注</label>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          placeholder="可选"
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.fav}
            onChange={(e) => setDraft((d) => ({ ...d, fav: e.target.checked }))}
          />
          收藏
        </label>
      </div>

      <div style={{ padding: 'var(--sp-lg)', borderTop: '1px solid var(--line)', display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'space-between' }}>
        {!isNew && (
          <button
            onClick={() => onDelete(draft.id)}
            style={{ ...smallBtnStyle, background: 'var(--surface)', color: 'var(--bad)', border: '1px solid var(--bad)' }}
          >
            删除
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ ...smallBtnStyle, background: 'var(--surface)', color: 'var(--dim)' }}>取消</button>
        <button onClick={handleSave} style={{ ...smallBtnStyle, background: 'var(--accent)', color: '#fff' }}>保存</button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--fs-sm)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  outline: 'none',
  width: '100%',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  fontSize: 'var(--fs-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};