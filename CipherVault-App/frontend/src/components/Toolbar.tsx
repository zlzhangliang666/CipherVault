interface ToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onNewEntry: () => void;
  sortBy: 'ts' | 'name';
  onSortChange: (v: 'ts' | 'name') => void;
}

export function Toolbar({ search, onSearchChange, onNewEntry, sortBy, onSortChange }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-sm)',
        alignItems: 'center',
        padding: 'var(--sp) var(--sp-lg)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        flexWrap: 'wrap',
      }}
    >
      <input
        type="text"
        placeholder="搜索条目..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 180,
          padding: '8px 12px',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-sm)',
          fontSize: 'var(--fs-sm)',
          background: 'var(--surface-2)',
          color: 'var(--txt)',
          outline: 'none',
        }}
      />
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as 'ts' | 'name')}
        style={{
          padding: '8px 12px',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-sm)',
          fontSize: 'var(--fs-sm)',
          background: 'var(--surface)',
          color: 'var(--dim)',
          cursor: 'pointer',
        }}
      >
        <option value="ts">按时间</option>
        <option value="name">按名称</option>
      </select>
      <button
        onClick={onNewEntry}
        style={{
          padding: '8px 16px',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 'var(--r-sm)',
          fontSize: 'var(--fs-sm)',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        + 新建条目
      </button>
    </div>
  );
}