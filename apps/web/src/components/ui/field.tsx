import * as React from 'react';
import { cn } from '@/lib/utils';

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('group/field flex min-w-0 flex-col gap-2', className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('grid min-w-0 gap-x-4 gap-y-5', className)}
      {...props}
    />
  );
}

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn('grid min-w-0 gap-5 border-0 p-0', className)}
      {...props}
    />
  );
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return (
    <legend
      data-slot="field-legend"
      className={cn('mb-1 text-lg font-bold leading-tight text-primary-strong', className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        'w-fit text-sm font-semibold leading-snug text-foreground group-data-[disabled=true]/field:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn('m-0 text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

function FieldError({ className, children, ...props }: React.ComponentProps<'p'>) {
  if (!children) return null;

  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn('m-0 text-sm font-semibold leading-relaxed text-destructive', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet };
