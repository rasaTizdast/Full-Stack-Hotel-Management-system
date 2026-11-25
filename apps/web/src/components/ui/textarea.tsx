import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'flex min-h-28 w-full min-w-0 rounded-xl border border-input bg-surface px-4 py-3 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:bg-destructive-soft aria-invalid:focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
