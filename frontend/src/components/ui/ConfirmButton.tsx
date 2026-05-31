import { useState } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = 'Na pewno?',
  className = 'btn-danger',
  disabled,
  children,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex gap-1 items-center">
        <button
          onClick={() => { onConfirm(); setConfirming(false); }}
          className="btn-danger py-1 px-2.5 text-xs"
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="btn-secondary py-1 px-2.5 text-xs"
        >
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} disabled={disabled} className={className}>
      {children ?? (
        <>
          <Trash2 size={14} />
          {label}
        </>
      )}
    </button>
  );
}
