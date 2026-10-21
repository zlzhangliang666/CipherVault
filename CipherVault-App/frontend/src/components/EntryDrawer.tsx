import { useState, useEffect } from 'react';
import type { Entry, EntryValue } from '../types';
import { newId } from '../lib/id';
import { ValueEditor } from './ValueEditor';
import {
  CUSTOM_ALPHABET_SIZE,
  DEFAULT_CUSTOM_ALPHABET,
  customAlphabetError,
} from '../crypto/skin';

interface EntryDrawerProps {
  entry: Entry | null;
  categories: string[];
  masterPassword: string | null;
  onSave: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  openKeycard: (value: EntryValue, entryName: string) => void;
}

function createEmptyValue(label = ''): EntryValue {
  return {
    id: newId(),
    label,
    value: '',
    skin: { name: '字母皮肤', rules: ['letter'] },
  };
}

function createEmptyEntry(): Entry {
  return {
    id: '',
    name: '',
    account: '',
    category: '通用',
    notes: '',
    fav: false,
    ts: Date.now(),
    values: [createEmptyValue('密码')],
  };
}

function alphabetOf(value: EntryValue): string[] {
  return Array.from(
    { length: CUSTOM_ALPHABET_SIZE },
    (_, i) => value.skin.custom?.[i] ?? DEFAULT_CUSTOM_ALPHABET[i],
  );
}

export function EntryDrawer({
  entry,
  categories,
  masterPassword,
  onSave,
  onDelete,
  onClose,
  openKeycard,
}: EntryDrawerProps) {
  const [draft, setDraft] = useState<Entry>(entry ?? createEmptyEntry());
  const isNew = !entry;

  useEffect(() => {
    setDraft(entry ?? createEmptyEntry());
  }, [entry]);

  const hasInvalidAlphabet = draft.values.some(
    (v) => v.skin.rules.includes('custom') && customAlphabetError(alphabetOf(v)),
  );

  const updateValue = (id: string, patch: Partial<EntryValue>) => {
    setDraft((d) => ({
      ...d,
      values: d.values.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  };

  const addValue = () => {
    setDraft((d) => ({ ...d, values: [...d.values, createEmptyValue()] }));
  };

  const removeValue = (id: string) => {
    setDraft((d) =>
      d.values.length <= 1 ? d : { ...d, values: d.values.filter((v) => v.id !== id) },
    );
  };

  const handleSave = () => {
    if (hasInvalidAlphabet) return;
    onSave({ ...draft, ts: Date.now() });
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', fontWeight: 600 }}>
            加密值（{draft.values.length}）
          </label>
          <button
            onClick={addValue}
            style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--accent)', padding: '4px 8px' }}
          >
            + 添加值
          </button>
        </div>

        {draft.values.map((v, i) => (
          <ValueEditor
            key={v.id}
            value={v}
            index={i}
            masterPassword={masterPassword}
            canRemove={draft.values.length > 1}
            onChange={(patch) => updateValue(v.id, patch)}
            onRemove={() => removeValue(v.id)}
            onOpenKeycard={() => openKeycard(v, draft.name)}
          />
        ))}

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
        <button
          onClick={handleSave}
          disabled={hasInvalidAlphabet}
          style={{
            ...smallBtnStyle,
            background: hasInvalidAlphabet ? 'var(--line-2)' : 'var(--accent)',
            color: '#fff',
            cursor: hasInvalidAlphabet ? 'not-allowed' : 'pointer',
          }}
        >
          保存
        </button>
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
