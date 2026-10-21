import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--sp-lg)',
          minWidth: 360,
          maxWidth: 520,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2 style={{ margin: '0 0 var(--sp)', fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}