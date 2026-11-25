import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button-variants';

const primaryButton = buttonVariants({ variant: 'default' });
const secondaryButton = buttonVariants({ variant: 'outline' });
const dangerButton = buttonVariants({ variant: 'destructive' });

const styles: Record<string, string> = {
  'staff-shell': 'min-h-dvh bg-background text-foreground',
  'skip-link':
    'sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:text-primary focus:shadow-lg',
  'staff-topbar':
    'sticky top-0 z-20 flex min-h-[5.25rem] items-center justify-between gap-6 border-b border-border/80 bg-card/95 px-5 backdrop-blur-xl lg:px-12',
  'staff-brand': 'inline-flex min-w-0 items-center gap-3 text-primary-strong no-underline',
  'staff-brand__mark': 'h-auto w-11 shrink-0 object-contain',
  'staff-brand__copy':
    'grid [&_strong]:text-sm [&_strong]:font-bold [&_small]:text-xs [&_small]:text-muted-foreground',
  'staff-topbar__right': 'flex items-center gap-3 sm:gap-6',
  'staff-property-label':
    'hidden items-center gap-2 text-xs font-semibold text-muted-foreground md:inline-flex',
  'staff-identity': 'flex items-center gap-2 border-s border-border ps-4',
  'staff-identity__avatar':
    'grid size-10 shrink-0 place-items-center rounded-full bg-surface-soft font-bold text-primary',
  'staff-identity__copy':
    'grid max-w-48 text-xs [&_strong]:truncate [&_small]:text-muted-foreground',
  'staff-identity__email': 'hidden text-xs text-muted-foreground xl:block',
  'staff-identity__role': 'text-xs text-muted-foreground',
  'staff-logout': cn(secondaryButton, 'gap-2 px-3 text-sm active:scale-[.985]'),
  'staff-layout':
    'mx-auto grid min-h-[calc(100dvh-5.25rem)] max-w-[100rem] grid-cols-1 lg:grid-cols-[17.5rem_minmax(0,1fr)]',
  'staff-sidebar':
    'flex min-w-0 flex-col gap-4 border-b border-border bg-card p-4 lg:border-b-0 lg:border-e lg:p-5',
  'staff-sidebar__heading': 'grid gap-1',
  'staff-sidebar__label': 'm-0 text-xs font-bold text-muted-foreground',
  'staff-nav-viewport': 'relative max-h-[40vh] overflow-y-auto lg:max-h-[calc(100dvh-15rem)]',
  'staff-nav-viewport--overflow':
    'after:pointer-events-none after:sticky after:bottom-0 after:block after:h-8 after:bg-gradient-to-t after:from-card after:to-transparent after:content-[""]',
  'staff-nav':
    'grid gap-1 [&_a]:group [&_a]:flex [&_a]:items-center [&_a]:gap-3 [&_a]:rounded-xl [&_a]:p-2 [&_a]:text-sm [&_a]:text-muted-foreground [&_a]:no-underline [&_a]:transition-colors [&_a:hover]:bg-accent [&_a:hover]:text-primary-strong [&_a[aria-current=page]]:bg-primary [&_a[aria-current=page]]:text-primary-foreground [&_a:focus-visible]:outline-3 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-ring',
  'staff-nav__glyph':
    'grid size-9 shrink-0 place-items-center rounded-lg bg-surface-soft text-primary transition-colors group-hover:bg-card group-hover:text-primary-strong group-aria-[current=page]:bg-card',
  'staff-nav__copy':
    'grid min-w-0 flex-1 text-start [&_strong]:truncate [&_strong]:text-sm [&_small]:text-xs [&_small]:text-muted-foreground',
  'staff-nav-overflow-cue':
    'pointer-events-none sticky bottom-0 block h-8 bg-gradient-to-t from-card to-transparent',
  'staff-nav__error': 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive',
  'staff-sidebar__note':
    'mt-auto flex items-center gap-3 rounded-xl border border-border bg-surface-soft p-3 text-xs text-muted-foreground',
  'staff-sidebar__note-mark': 'size-9 shrink-0',
  'staff-main': 'min-w-0 p-4 outline-none sm:p-6 lg:p-8',
  'staff-overview': 'mx-auto grid max-w-6xl gap-8',
  'staff-overview__hero':
    'relative grid overflow-hidden rounded-2xl bg-primary-strong p-6 text-primary-foreground shadow-lg sm:grid-cols-[minmax(0,1fr)_minmax(15rem,.55fr)] sm:items-center sm:gap-6 sm:p-10',
  'staff-overview__hero-copy': 'relative z-10 max-w-3xl',
  'staff-overview__note-index': 'text-xs font-bold tracking-wide text-highlight',
  'staff-overview__intro': 'max-w-2xl text-base leading-8 text-primary-foreground/80',
  'staff-overview__hero-note':
    'grid gap-2 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 backdrop-blur-sm',
  'staff-overview__note-mark':
    'grid size-10 place-items-center rounded-full bg-highlight/20 text-highlight',
  'staff-overview__section-heading':
    'flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-start',
  'staff-overview__actions': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
  'staff-overview__action':
    'group grid gap-3 rounded-xl border border-border bg-card p-5 text-start text-foreground no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
  'staff-overview__action-icon':
    'grid size-11 place-items-center rounded-xl bg-surface-soft text-primary',
  'staff-overview__action-description': 'text-sm leading-6 text-muted-foreground',
  'staff-overview__action-link': 'text-sm font-bold text-primary',
  'staff-overview__quiet-state':
    'rounded-xl border border-dashed border-border bg-card p-6 text-muted-foreground',
  'staff-session-state':
    'mx-auto grid min-h-64 max-w-2xl place-items-center gap-4 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground',
  'staff-session-state__mark':
    'size-10 animate-pulse rounded-full bg-primary/20 ring-8 ring-primary/5',
  'staff-accounts': 'mx-auto grid max-w-7xl gap-5',
  'staff-accounts-denied':
    'mx-auto grid max-w-3xl gap-4 rounded-xl border border-destructive/25 bg-card p-6',
  'staff-bookings-denied':
    'mx-auto grid max-w-3xl gap-4 rounded-xl border border-destructive/25 bg-card p-6',
  'staff-accounts__header':
    'flex items-end justify-between gap-4 max-md:flex-col max-md:items-start',
  'staff-accounts__eyebrow': 'text-xs font-bold text-accent-brand',
  'staff-accounts__primary': primaryButton,
  'staff-accounts__secondary': secondaryButton,
  'staff-accounts__danger': dangerButton,
  'staff-accounts__actions': 'flex flex-wrap gap-2',
  'staff-accounts__action-form': 'inline-flex',
  'staff-accounts__error': 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive',
  'staff-accounts__text-button':
    'inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary underline underline-offset-4',
  'staff-accounts__notice': 'rounded-lg bg-warning-soft p-3 text-sm text-warning',
  'staff-accounts__form': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-accounts__form-heading': 'border-b border-border pb-3 font-bold text-primary-strong',
  'staff-accounts__fields': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
  'staff-accounts__form-actions': 'flex flex-wrap gap-3',
  'staff-accounts__list': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-accounts__list-heading': 'flex items-center justify-between gap-3',
  'staff-accounts__state': 'rounded-lg bg-surface-soft p-4 text-sm text-muted-foreground',
  'staff-accounts__state--error': '!bg-destructive-soft !text-destructive',
  'staff-accounts__table-wrap': 'max-w-full overflow-x-auto rounded-lg border border-border',
  'staff-accounts__table':
    'w-full min-w-[46rem] border-collapse text-start text-sm [&_th]:bg-surface-soft [&_th]:font-bold [&_th]:text-primary-strong [&_th]:text-start [&_th]:p-3 [&_td]:border-t [&_td]:border-border [&_td]:p-3',
  'staff-accounts__visually-hidden': 'sr-only',
  'staff-accounts__status':
    'inline-flex rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-muted-foreground',
  'staff-accounts__status--active': '!bg-success-soft !text-success',
  'staff-accounts__mobile-cards': 'grid gap-3 sm:hidden',
  'staff-accounts__mobile-card': 'grid gap-2 rounded-lg border border-border p-4',
  'staff-accounts__mobile-email': 'break-all text-xs text-muted-foreground',
  'staff-accounts__pagination': 'flex items-center justify-between gap-3',
  'staff-password':
    'mx-auto grid max-w-2xl gap-5 rounded-xl border border-border bg-card p-6 shadow-sm',
  'staff-password__intro': 'grid gap-2',
  'staff-password__eyebrow': 'text-xs font-bold text-accent-brand',
  'staff-password__form': 'grid gap-4',
  'staff-password__error': 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive',
  'staff-password__success': 'rounded-lg bg-success-soft p-3 text-sm text-success',
  'staff-inventory': 'mx-auto grid max-w-7xl gap-5',
  'staff-inventory-denied':
    'mx-auto grid max-w-3xl gap-4 rounded-xl border border-destructive/25 bg-card p-6',
  'staff-inventory__header':
    'flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-start',
  'staff-inventory__snapshot-note':
    'flex items-start gap-3 rounded-xl border border-highlight/30 bg-warning-soft p-4 text-sm text-warning',
  'staff-inventory__note-mark': 'grid size-9 shrink-0 place-items-center rounded-full bg-card',
  'staff-inventory__rooms-link': 'font-bold text-primary underline underline-offset-4',
  'staff-inventory__range-form': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-inventory__range-heading': 'flex items-center justify-between gap-3',
  'staff-inventory__range-fields': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
  'staff-inventory__field': 'grid min-w-0 gap-1.5 text-sm font-semibold',
  'staff-inventory__field--room': 'sm:col-span-2',
  'staff-inventory__input': '',
  'staff-inventory__hint': 'text-xs font-normal text-muted-foreground',
  'staff-inventory__field-error': 'text-xs text-destructive',
  'staff-inventory__load': secondaryButton,
  'staff-inventory__save': primaryButton,
  'staff-inventory__message': 'rounded-lg bg-surface-soft p-3 text-sm text-muted-foreground',
  'staff-inventory__message--error': '!bg-destructive-soft !text-destructive',
  'staff-inventory__loading':
    'animate-pulse rounded-lg bg-surface-soft p-4 text-sm text-muted-foreground',
  'staff-inventory__empty':
    'rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground',
  'staff-inventory__overview': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-inventory__overview-heading': 'flex items-center justify-between gap-3',
  'staff-inventory__night-count': 'rounded-full bg-surface-soft px-3 py-1 text-xs font-bold',
  'staff-inventory__table-scroll':
    'max-w-full overflow-x-auto rounded-lg border border-border [&_table]:w-full [&_table]:min-w-[48rem] [&_table]:text-sm [&_th]:bg-surface-soft [&_th]:p-3 [&_td]:border-t [&_td]:border-border [&_td]:p-3',
  'staff-inventory__night-cards': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
  'staff-inventory__night-card': 'grid gap-2 rounded-lg border border-border bg-surface p-4',
  'staff-inventory__capacity-source': 'text-xs text-muted-foreground',
  'staff-inventory__edit-form': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-inventory__edit-heading': 'flex items-center justify-between gap-3',
  'staff-inventory__historical-rate-note': 'rounded-lg bg-warning-soft p-3 text-sm text-warning',
  'staff-inventory__edit-fields': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
  'staff-inventory__rate-impact':
    'flex flex-wrap items-center gap-3 rounded-lg bg-surface-soft p-4',
  'staff-inventory__rate-impact-label': 'text-sm font-bold text-primary-strong',
  'staff-inventory__rate-equation': 'flex flex-wrap items-center gap-2 font-semibold tabular-nums',
  'staff-inventory__money': 'inline-flex items-baseline gap-1',
  'staff-inventory__money-amount': 'font-bold text-primary-strong',
  'staff-inventory__money-unit': 'text-xs text-muted-foreground',
  'staff-inventory__equation-token': 'text-sm font-bold text-muted-foreground',
  'staff-inventory__rate-disclosure': 'rounded-lg border border-border p-4',
  'staff-inventory__missing-rate': 'text-warning',
  'staff-rooms': 'mx-auto grid max-w-7xl gap-5',
  'staff-rooms-denied':
    'mx-auto grid max-w-3xl gap-4 rounded-xl border border-destructive/25 bg-card p-6',
  'staff-rooms__header': 'flex items-end justify-between gap-4 max-md:flex-col max-md:items-start',
  'staff-rooms__eyebrow': 'text-xs font-bold text-accent-brand',
  'staff-rooms__header-actions': 'flex flex-wrap items-center gap-3',
  'staff-rooms__summary': 'flex flex-wrap gap-2 text-sm font-semibold text-muted-foreground',
  'staff-rooms__add-toggle': primaryButton,
  'staff-rooms__message': 'rounded-lg bg-surface-soft p-3 text-sm text-muted-foreground',
  'staff-rooms__message--error': '!bg-destructive-soft !text-destructive',
  'staff-rooms__message--success': '!bg-success-soft !text-success',
  'staff-rooms__filters': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-rooms__filters-heading': 'font-bold text-primary-strong',
  'staff-rooms__filter-fields': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
  'staff-rooms__field': 'grid min-w-0 gap-1.5 text-sm font-semibold',
  'staff-rooms__field--search': 'sm:col-span-2',
  'staff-rooms__field--read-only': 'rounded-lg bg-surface-soft p-3',
  'staff-rooms__field--features': 'sm:col-span-2',
  'staff-rooms__filter-actions': 'flex flex-wrap gap-3',
  'staff-rooms__filter-button': primaryButton,
  'staff-rooms__list': 'grid gap-4',
  'staff-rooms__list-heading': 'flex items-center justify-between gap-3',
  'staff-rooms__state': 'rounded-lg bg-surface-soft p-4 text-sm text-muted-foreground',
  'staff-rooms__empty':
    'rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground',
  'staff-rooms__grid': 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3',
  'staff-rooms__card':
    'grid content-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm',
  'staff-rooms__card-heading': 'flex items-start justify-between gap-3',
  'staff-rooms__generated-badge':
    'inline-flex rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-muted-foreground',
  'staff-rooms__details':
    'grid grid-cols-2 gap-3 text-sm [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:font-semibold',
  'staff-rooms__features':
    'flex flex-wrap gap-2 [&_span]:rounded-full [&_span]:bg-surface-soft [&_span]:px-2.5 [&_span]:py-1 [&_span]:text-xs',
  'staff-rooms__card-actions': 'flex flex-wrap gap-2',
  'staff-rooms__editor': 'grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm',
  'staff-rooms__editor-heading': 'flex items-center justify-between gap-3',
  'staff-rooms__generated-note': 'rounded-lg bg-warning-soft p-3 text-sm text-warning',
  'staff-rooms__editor-fields': 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
  'staff-rooms__hint': 'text-xs text-muted-foreground',
  'staff-rooms__field-error': 'text-xs text-destructive',
  'staff-rooms__editor-actions': 'flex flex-wrap gap-3',
  'staff-rooms__dialog-backdrop': 'fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4',
  'staff-rooms__confirm':
    'grid w-full max-w-lg gap-4 rounded-xl border border-border bg-card p-6 shadow-xl',
  'staff-rooms__confirm-actions': 'flex flex-wrap justify-end gap-3',
  'staff-rooms__status':
    'inline-flex rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-muted-foreground',
  'staff-rooms__status--active': 'bg-success-soft text-success',
  'staff-rooms__filter-button:hover': 'hover:bg-primary-strong',
  button: buttonVariants({ variant: 'default' }),
  'button--jade': buttonVariants({ variant: 'default' }),
  'button--quiet': buttonVariants({ variant: 'outline' }),
  'button--danger': buttonVariants({ variant: 'destructive' }),
  'button--danger-quiet': buttonVariants({ variant: 'destructiveOutline' }),
};

export function staffClass(names: string): string {
  const utilities = names
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => styles[name] ?? '')
    .filter(Boolean)
    .join(' ');
  return cn(names, utilities);
}
