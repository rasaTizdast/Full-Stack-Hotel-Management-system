import type { VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button-variants';

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  };

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
