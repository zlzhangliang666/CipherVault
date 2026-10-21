import { useState, useEffect } from 'react';
import type { Entry } from '../types';
import { scorePassword } from '../crypto/strength';
import { StrengthMeter } from './StrengthMeter';
import { generatePassword } from '../crypto/generator';
import {
  BUILTIN_SKINS,
  CUSTOM_SKIN_NAME,
  RULE_LABELS,
  normalizeRules,
  type RuleName,
} from '../crypto/skin';

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

  const isBuiltinSkin = BUILTIN_SKINS.some((s) => s.name === draft.skin.name);
  const skinValue = isBuiltinSkin ? draft.skin.name : CUSTOM_SKIN_NAME;

  const setRules = (next: RuleName[]) => {
    setDraft((d) => ({
      ...d,
      skin: { name: CUSTOM_SKIN_NAME, rules: next },
      kc: undefined,
    }));
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
          value={skinValue}
          onChange={(e) => {
            if (e.target.value === CUSTOM_SKIN_NAME) {
              setDraft((d) => ({
                ...d,
                skin: { name: CUSTOM_SKIN_NAME, rules: normalizeRules(d.skin.rules) },
                kc: undefined,
              }));
              return;
            }
            const skin = BUILTIN_SKINS.find((s) => s.name === e.target.value);
            if (skin)
              setDraft((d) => ({ ...d, skin: { name: skin.name, rules: skin.rules }, kc: undefined }));
          }}
          style={inputStyle}
        >
          {BUILTIN_SKINS.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
          <option value={CUSTOM_SKIN_NAME}>{CUSTOM_SKIN_NAME}（逐位设置）</option>
        </select>

        {draft.skin.name === CUSTOM_SKIN_NAME && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)' }}>
              趣味显示的每一位独立设置；显示长度超过设定时按顺序循环。
            </div>
            {draft.skin.rules.map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', width: 48, flexShrink: 0 }}>
                  第 {i + 1} 位
                </span>
                <select
                  value={rule}
                  onChange={(e) => {
                    const next = [...draft.skin.rules];
                    next[i] = e.target.value as RuleName;
                    setRules(next);
                  }}
                  style={{ ...inputStyle, flex: 1, padding: '6px 8px' }}
                >
                  {(Object.keys(RULE_LABELS) as RuleName[]).map((r) => (
                    <option key={r} value={r}>{RULE_LABELS[r]}</option>
                  ))}
                </select>
                <button
                  onClick={() => setRules(draft.skin.rules.filter((_, j) => j !== i))}
                  disabled={draft.skin.rules.length <= 1}
                  style={{
                    ...smallBtnStyle,
                    background: 'var(--surface-2)',
                    color: draft.skin.rules.length <= 1 ? 'var(--mute)' : 'var(--bad)',
                    flexShrink: 0,
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setRules([...draft.skin.rules, draft.skin.rules[draft.skin.rules.length - 1] ?? 'letter'])
              }
              style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--accent)', alignSelf: 'flex-start' }}
            >
              + 添加一位
            </button>
          </div>
        )}

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