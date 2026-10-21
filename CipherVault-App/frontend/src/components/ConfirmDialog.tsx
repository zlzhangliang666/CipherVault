import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
  danger,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p style={{ color: 'var(--dim)', margin: '0 0 var(--sp-lg)', lineHeight: 1.6 }}>{message}</p>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--line-2)',
            background: 'var(--surface)',
            color: 'var(--dim)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--r-sm)',
            background: danger ? 'var(--bad)' : 'var(--accent)',
            color: '#fff',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}