import type { ReactNode } from 'react';
import styles from './staff.module.css';

export default function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.staffScope}>{children}</div>;
}
