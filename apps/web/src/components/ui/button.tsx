'use client';

import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button-variants';

export { buttonVariants } from './button-variants';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button };
