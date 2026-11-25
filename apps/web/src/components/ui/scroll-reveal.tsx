'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const revealDelays: Record<number, string> = {
  0: 'delay-0',
  80: 'delay-[80ms]',
  90: 'delay-[90ms]',
  160: 'delay-[160ms]',
  180: 'delay-[180ms]',
  240: 'delay-[240ms]',
  270: 'delay-[270ms]',
  320: 'delay-[320ms]',
  360: 'delay-[360ms]',
  400: 'delay-[400ms]',
  450: 'delay-[450ms]',
  480: 'delay-[480ms]',
  540: 'delay-[540ms]',
  560: 'delay-[560ms]',
  630: 'delay-[630ms]',
  640: 'delay-[640ms]',
  720: 'delay-[720ms]',
  800: 'delay-[800ms]',
  810: 'delay-[810ms]',
  900: 'delay-[900ms]',
};

export function ScrollReveal({ children, className, delay = 0 }: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        element.dataset.revealReady = 'true';
        if (entry.isIntersecting) {
          element.dataset.revealVisible = 'true';
          observer.unobserve(element);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={elementRef}
      className={cn(
        'translate-y-0 opacity-100 transition-[opacity,transform] duration-[760ms] ease-[var(--motion-out)] data-[reveal-ready=true]:data-[reveal-visible=false]:translate-y-6 data-[reveal-ready=true]:data-[reveal-visible=false]:opacity-0 data-[reveal-visible=true]:translate-y-0 data-[reveal-visible=true]:opacity-100 motion-reduce:transition-none motion-reduce:data-[reveal-ready=true]:data-[reveal-visible=false]:translate-y-0 motion-reduce:data-[reveal-ready=true]:data-[reveal-visible=false]:opacity-100',
        revealDelays[delay],
        className,
      )}
    >
      {children}
    </div>
  );
}
