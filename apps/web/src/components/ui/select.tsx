'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full min-w-0">
      <select
        ref={ref}
        data-slot="native-select"
        className={cn(
          'flex h-12 w-full min-w-0 appearance-none rounded-xl border border-input bg-surface py-2 ps-4 pe-10 text-start text-base text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:bg-destructive-soft aria-invalid:focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      'flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-input bg-surface px-4 py-2 text-start text-base text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:bg-destructive-soft aria-invalid:focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 truncate">{children}</span>
    <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
      <ChevronDown aria-hidden="true" className="size-4" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-50"
        alignItemWithTrigger={false}
        align="end"
        sideOffset={4}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-11 w-full cursor-default select-none items-center rounded-xl py-2 ps-3 pe-9 text-sm outline-none data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute end-3 inline-flex items-center">
        <Check aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { NativeSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
