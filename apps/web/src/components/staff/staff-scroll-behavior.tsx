'use client';

import { useEffect } from 'react';

export function StaffScrollBehavior() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('scroll-auto');
    return () => root.classList.remove('scroll-auto');
  }, []);

  return null;
}
