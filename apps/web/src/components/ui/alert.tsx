import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full gap-y-1 rounded-xl border px-4 py-3 text-sm leading-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-soft text-foreground',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        destructive: 'border-destructive/25 bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type AlertProps = React.ComponentProps<'div'> & VariantProps<typeof alertVariants>;

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'h5'>) {
  return <h5 data-slot="alert-title" className={cn('font-bold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="alert-description" className={cn('text-current/90', className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
