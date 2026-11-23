import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full min-w-0 rounded-lg border border-input bg-surface px-4 py-2 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:bg-destructive-soft aria-invalid:focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
