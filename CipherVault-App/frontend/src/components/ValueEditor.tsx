import { useState, useEffect, useRef } from 'react';
import type { EntryValue } from '../types';
import { scorePassword } from '../crypto/strength';
import { StrengthMeter } from './StrengthMeter';
import { generatePassword } from '../crypto/generator';
import { createEntryKeycard } from '../crypto/keycard';
import {
  BUILTIN_SKINS,
  CUSTOM_ALPHABET_SIZE,
  CUSTOM_SKIN_NAME,
  DEFAULT_CUSTOM_ALPHABET,
  RULE_LABELS,
  customAlphabetError,
  normalizeRules,
  type RuleName,
} from '../crypto/skin';

interface ValueEditorProps {
  value: EntryValue;
  index: number;
  masterPassword: string | null;
  canRemove: boolean;
  onChange: (patch: Partial<EntryValue>) => void;
  onRemove: () => void;
  onOpenKeycard: () => void;
}

export function ValueEditor({
  value,
  index,
  masterPassword,
  canRemove,
  onChange,
  onRemove,
  onOpenKeycard,
}: ValueEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const strength = scorePassword(value.value);
  const display = value.kc?.display ?? '';

  const customValues = Array.from(
    { length: CUSTOM_ALPHABET_SIZE },
    (_, i) => value.skin.custom?.[i] ?? DEFAULT_CUSTOM_ALPHABET[i],
  );
  const usesCustom = value.skin.rules.includes('custom');
  const alphabetErr = usesCustom ? customAlphabetError(customValues) : null;
  const previewSig = JSON.stringify([value.value, value.skin.rules, customValues]);
  const lastPreviewSig = useRef(value.kc ? previewSig : '');

  // 输入值或修改皮肤后自动生成趣味显示，无需点击保存
  useEffect(() => {
    if (!value.value || !masterPassword || alphabetErr) {
      if (value.kc) onChange({ kc: undefined });
      setPreviewing(false);
      return;
    }
    if (value.kc && lastPreviewSig.current === previewSig) return;

    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      createEntryKeycard(masterPassword, value.value, value.skin.rules, customValues)
        .then((kc) => {
          if (cancelled) return;
          lastPreviewSig.current = previewSig;
          onChange({ kc });
        })
        .catch(() => {
          if (!cancelled) onChange({ kc: undefined });
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // previewSig 已包含值、规则与自定义文字，足以决定是否重新生成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSig, masterPassword, alphabetErr, value.kc]);

  const isBuiltinSkin = BUILTIN_SKINS.some((s) => s.name === value.skin.name);
  const skinValue = isBuiltinSkin ? value.skin.name : CUSTOM_SKIN_NAME;

  const setSkin = (patch: Partial<EntryValue['skin']>) =>
    onChange({ skin: { ...value.skin, ...patch }, kc: undefined });

  const setRules = (next: RuleName[]) =>
    onChange({
      skin: {
        name: CUSTOM_SKIN_NAME,
        rules: next,
        custom: value.skin.custom ?? [...DEFAULT_CUSTOM_ALPHABET],
      },
      kc: undefined,
    });

  const setCustomValue = (i: number, text: string) => {
    const next = [...customValues];
    next[i] = text;
    setSkin({ custom: next });
  };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
        padding: 'var(--sp)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-sm)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
        <input
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
          style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontWeight: 600 }}
          placeholder={index === 0 ? '密码' : '如 API Key / 恢复码'}
        />
        <button
          onClick={onOpenKeycard}
          style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--accent)' }}
        >
          钥匙卡
        </button>
        {canRemove && (
          <button
            onClick={onRemove}
            style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--bad)' }}
          >
            删除
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <input
          value={value.value}
          onChange={(e) => onChange({ value: e.target.value, kc: undefined })}
          style={{ ...inputStyle, flex: 1 }}
          placeholder={index === 0 ? '输入或生成密码' : '输入需要加密的信息'}
        />
        <button onClick={() => onChange({ value: generatePassword(), kc: undefined })} style={smallBtnStyle}>
          生成
        </button>
      </div>

      {index === 0 && <StrengthMeter score={strength.score} label={strength.label} />}

      {value.value && (
        <div
          style={{
            fontSize: 'var(--fs-xs)',
            color: alphabetErr ? 'var(--bad)' : 'var(--dim)',
            padding: '6px 8px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-sm)',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}
        >
          {alphabetErr
            ? `自定义文字有误：${alphabetErr}`
            : previewing
              ? '正在生成趣味显示…'
              : display || '输入后自动生成趣味显示（由密文编码，不含明文）'}
        </div>
      )}

      <details>
        <summary style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', cursor: 'pointer' }}>
          皮肤：{value.skin.name}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          <select
            value={skinValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM_SKIN_NAME) {
                setSkin({
                  name: CUSTOM_SKIN_NAME,
                  rules: normalizeRules(value.skin.rules),
                  custom: value.skin.custom ?? [...DEFAULT_CUSTOM_ALPHABET],
                });
                return;
              }
              const skin = BUILTIN_SKINS.find((s) => s.name === e.target.value);
              if (skin) onChange({ skin: { name: skin.name, rules: skin.rules }, kc: undefined });
            }}
            style={inputStyle}
          >
            {BUILTIN_SKINS.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
            <option value={CUSTOM_SKIN_NAME}>{CUSTOM_SKIN_NAME}（逐位设置）</option>
          </select>

          {value.skin.name === CUSTOM_SKIN_NAME && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)' }}>
                趣味显示的每一位独立设置；显示长度超过设定时按顺序循环。
              </div>
              {value.skin.rules.map((rule, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)', width: 48, flexShrink: 0 }}>
                    第 {i + 1} 位
                  </span>
                  <select
                    value={rule}
                    onChange={(e) => {
                      const next = [...value.skin.rules];
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
                    onClick={() => setRules(value.skin.rules.filter((_, j) => j !== i))}
                    disabled={value.skin.rules.length <= 1}
                    style={{
                      ...smallBtnStyle,
                      background: 'var(--surface-2)',
                      color: value.skin.rules.length <= 1 ? 'var(--mute)' : 'var(--bad)',
                      flexShrink: 0,
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setRules([
                    ...value.skin.rules,
                    value.skin.rules[value.skin.rules.length - 1] ?? 'letter',
                  ])
                }
                style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--accent)', alignSelf: 'flex-start' }}
              >
                + 添加一位
              </button>

              {usesCustom && (
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--dim)' }}>
                      自定义文字（0–F 各填一个，不能重复）
                    </span>
                    <button
                      onClick={() => setSkin({ custom: [...DEFAULT_CUSTOM_ALPHABET] })}
                      style={{ ...smallBtnStyle, background: 'var(--surface-2)', color: 'var(--dim)', padding: '4px 8px' }}
                    >
                      恢复默认
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    {customValues.map((text, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span
                          style={{
                            width: 16,
                            flexShrink: 0,
                            fontSize: 'var(--fs-xs)',
                            color: 'var(--dim)',
                            fontFamily: 'var(--mono)',
                          }}
                        >
                          {i.toString(16).toUpperCase()}
                        </span>
                        <input
                          value={text}
                          onChange={(e) => setCustomValue(i, e.target.value)}
                          style={{ ...inputStyle, padding: '4px 6px', fontSize: 'var(--fs-xs)', minWidth: 0 }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </details>
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
