interface SidebarProps {
  categories: string[];
  activeCategory: string | null;
  onSelect: (cat: string | null) => void;
  onAdd: () => void;
}

export function Sidebar({ categories, activeCategory, onSelect, onAdd }: SidebarProps) {
  const baseStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 'var(--r-sm)',
    fontSize: 'var(--fs-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    border: 'none',
    background: 'none',
    display: 'block',
    transition: 'background 0.15s',
  };

  return (
    <aside
      style={{
        width: 200,
        minWidth: 200,
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        padding: 'var(--sp) var(--sp-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'auto',
      }}
    >
      <button
        style={{
          ...baseStyle,
          fontWeight: activeCategory === null ? 700 : 400,
          background: activeCategory === null ? 'var(--accent-soft)' : 'transparent',
          color: activeCategory === null ? 'var(--accent)' : 'var(--txt)',
        }}
        onClick={() => onSelect(null)}
      >
        全部条目
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          style={{
            ...baseStyle,
            fontWeight: activeCategory === cat ? 700 : 400,
            background: activeCategory === cat ? 'var(--accent-soft)' : 'transparent',
            color: activeCategory === cat ? 'var(--accent)' : 'var(--txt)',
          }}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </button>
      ))}
      <button
        style={{
          ...baseStyle,
          marginTop: 'var(--sp-sm)',
          color: 'var(--accent)',
          fontWeight: 600,
        }}
        onClick={onAdd}
      >
        + 新建分类
      </button>
    </aside>
  );
}