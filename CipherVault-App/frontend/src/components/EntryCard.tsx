import type { Entry } from '../api/types';

interface EntryCardProps {
  entry: Entry;
  onClick: () => void;
}

export function EntryCard({ entry, onClick }: EntryCardProps) {
  const date = new Date(entry.ts).toLocaleDateString('zh-CN');
  return (
    <div
      onClick={onClick}
      style={{
        padding: 'var(--sp)',
        background: 'var(--surface)',
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--line)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--fs)', marginBottom: 2 }}>
          {entry.name || '(未命名)'}
          {entry.fav && <span style={{ marginLeft: 4, color: 'var(--warn)' }}>★</span>}
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)' }}>
          {entry.account} · {entry.category}
        </div>
      </div>
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>{date}</span>
    </div>
  );
}