import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-5',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary text-primary-foreground',
        secondary: 'border-border bg-muted text-foreground',
        outline: 'border-border bg-surface text-foreground',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        destructive: 'border-destructive/25 bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
