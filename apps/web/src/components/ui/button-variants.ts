import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-strong',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive',
        destructiveOutline:
          'border border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive/10 focus-visible:outline-destructive',
        outline: 'border border-input bg-surface hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-11 rounded-xl px-4',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
