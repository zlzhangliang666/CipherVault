import { useState, useMemo, useCallback } from 'react';
import type { Entry } from '../api/types';
import { useVaultStore } from '../state/vaultStore';
import { useSession } from '../state/session';
import { Sidebar } from '../components/Sidebar';
import { Toolbar } from '../components/Toolbar';
import { EntryCard } from '../components/EntryCard';
import { EntryDrawer } from '../components/EntryDrawer';
import { CipherKeycard } from '../components/CipherKeycard';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

export function Vault() {
  const { entries, categories, addEntry, updateEntry, deleteEntry, addCategory } = useVaultStore();
  const masterPassword = useSession((s) => s.masterPassword);
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'ts' | 'name'>('ts');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [keycardEntry, setKeycardEntry] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    let list = [...entries];
    if (activeCategory) {
      list = list.filter((e) => e.category === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.account.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.ts - a.ts;
    });
    return list;
  }, [entries, search, sortBy, activeCategory]);

  const handleNewEntry = useCallback(() => {
    setEditingEntry(null);
    setIsNewEntry(true);
  }, []);

  const handleEdit = useCallback((entry: Entry) => {
    setEditingEntry(entry);
    setIsNewEntry(false);
  }, []);

  const handleSave = useCallback(
    (entry: Entry) => {
      if (isNewEntry) {
        addEntry(entry);
        toast('条目已创建', 'success');
      } else {
        updateEntry(entry.id, entry);
        toast('条目已更新', 'success');
      }
      setEditingEntry(null);
      setIsNewEntry(false);
    },
    [isNewEntry, addEntry, updateEntry, toast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteEntry(id);
      setEditingEntry(null);
      toast('条目已删除', 'info');
    },
    [deleteEntry, toast],
  );

  const handleOpenKeycard = useCallback((entry: Entry) => {
    setEditingEntry(null);
    setKeycardEntry(entry);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        onAdd={() => setNewCatOpen(true)}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Toolbar
          search={search}
          onSearchChange={setSearch}
          onNewEntry={handleNewEntry}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'var(--sp-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-sm)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--mute)', padding: 'var(--sp-xl)' }}>
              {search ? '没有匹配的条目' : '保险箱为空 — 点击"+ 新建条目"开始'}
            </div>
          ) : (
            filtered.map((e) => <EntryCard key={e.id} entry={e} onClick={() => handleEdit(e)} />)
          )}
        </div>
      </div>

      {(editingEntry || isNewEntry) && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.2)',
              zIndex: 499,
            }}
            onClick={() => {
              setEditingEntry(null);
              setIsNewEntry(false);
            }}
          />
          <EntryDrawer
            entry={editingEntry}
            categories={categories}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => {
              setEditingEntry(null);
              setIsNewEntry(false);
            }}
            openKeycard={handleOpenKeycard}
          />
        </>
      )}

      {keycardEntry && masterPassword && (
        <CipherKeycard
          entry={keycardEntry}
          masterPassword={masterPassword}
          onClose={() => setKeycardEntry(null)}
        />
      )}

      <Modal open={newCatOpen} onClose={() => setNewCatOpen(false)} title="新建分类">
        <input
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--fs-sm)',
            marginBottom: 'var(--sp-lg)',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
          <button onClick={() => setNewCatOpen(false)} style={btnStyle}>
            取消
          </button>
          <button
            onClick={() => {
              if (newCatName.trim()) {
                addCategory(newCatName.trim());
                setNewCatName('');
                setNewCatOpen(false);
              }
            }}
            style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}
          >
            创建
          </button>
        </div>
      </Modal>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};