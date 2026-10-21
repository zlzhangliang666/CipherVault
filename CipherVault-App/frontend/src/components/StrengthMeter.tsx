interface StrengthMeterProps {
  score: number; // 0..4
  label: string;
}

const colors = ['var(--mute)', 'var(--bad)', 'var(--warn)', '#6ea8fe', 'var(--good)'];

export function StrengthMeter({ score, label }: StrengthMeterProps) {
  const pct = ((score + 1) / 5) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: 'var(--surface-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: colors[score] || colors[0],
            borderRadius: 2,
            transition: 'width 0.3s',
          }}
        />
      </div>
      <span style={{ fontSize: 'var(--fs-xs)', color: colors[score], fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
        {label}
      </span>
    </div>
  );
}