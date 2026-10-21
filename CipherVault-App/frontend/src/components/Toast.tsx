/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface ToastCtx {
  toast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              background: item.type === 'error' ? 'var(--bad)' : item.type === 'success' ? 'var(--good)' : 'var(--accent)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 'var(--r-sm)',
              fontSize: 'var(--fs-sm)',
              boxShadow: 'var(--shadow)',
              maxWidth: 340,
              wordBreak: 'break-word',
            }}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}