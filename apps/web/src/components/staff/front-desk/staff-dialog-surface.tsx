import type { KeyboardEvent, ReactNode } from 'react';
import styles from './staff-front-desk.module.css';

interface StaffDialogSurfaceProps {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

function keepFocusInside(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;
  const activeNonTabbableChild =
    activeElement instanceof HTMLElement &&
    event.currentTarget.contains(activeElement) &&
    activeElement.tabIndex < 0;
  if (
    event.shiftKey &&
    (activeElement === first || activeElement === event.currentTarget || activeNonTabbableChild)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function StaffDialogSurface({ labelledBy, onClose, children }: StaffDialogSurfaceProps) {
  return (
    <div className={styles.dialogBackdrop}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={(event) => keepFocusInside(event, onClose)}
      >
        {children}
      </section>
    </div>
  );
}
