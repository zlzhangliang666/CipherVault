import { useState, useMemo, useCallback } from 'react';
import type { Entry, EntryValue } from '../types';
import { useVaultStore } from '../state/vaultStore';
import { useSession } from '../state/session';
import { createEntryKeycard } from '../crypto/keycard';
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
  const [keycardTarget, setKeycardTarget] = useState<{ name: string; value: EntryValue } | null>(null);
  const [saving, setSaving] = useState(false);

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
    async (entry: Entry) => {
      if (saving) return;
      setSaving(true);
      try {
        const next: Entry = { ...entry, ts: Date.now() };
        if (masterPassword) {
          // 每个加密值独立生成钥匙卡；趣味显示串由**密文**生成，绝不编码明文
          next.values = await Promise.all(
            entry.values.map(async (v) => {
              if (!v.value) return { ...v, kc: undefined };
              return {
                ...v,
                kc:
                  v.kc ??
                  (await createEntryKeycard(
                    masterPassword,
                    v.value,
                    v.skin.rules,
                    v.skin.custom,
                  )),
              };
            }),
          );
        } else {
          next.values = entry.values.map((v) => ({ ...v, kc: undefined }));
        }

        if (isNewEntry) {
          addEntry(next);
          toast('条目已创建', 'success');
        } else {
          updateEntry(entry.id, next);
          toast('条目已更新', 'success');
        }
        setEditingEntry(null);
        setIsNewEntry(false);
      } catch (e) {
        toast(`保存失败：${(e as Error).message}`, 'error');
      } finally {
        setSaving(false);
      }
    },
    [isNewEntry, addEntry, updateEntry, toast, masterPassword, saving],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteEntry(id);
      setEditingEntry(null);
      toast('条目已删除', 'info');
    },
    [deleteEntry, toast],
  );

  const handleOpenKeycard = useCallback((value: EntryValue, name: string) => {
    // 保留编辑抽屉，避免打开钥匙卡时丢失未保存的改动
    setKeycardTarget({ name, value });
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
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
            masterPassword={masterPassword}
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

      {keycardTarget && masterPassword && (
        <CipherKeycard
          entryName={keycardTarget.name}
          value={keycardTarget.value}
          masterPassword={masterPassword}
          onClose={() => setKeycardTarget(null)}
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