# خانه‌باغ نارنج design system

This document is the visual source of truth for the hotel website and staff workspace. The implemented theme lives in `apps/web/src/app/globals.css`; reusable controls live in `apps/web/src/components/ui`. Build page layout with Tailwind utilities and semantic theme tokens. Do not add CSS modules or page-specific CSS for styling.

## Product character

The interface should feel like a calm, considered Shiraz guesthouse: warm stone surfaces, deep garden green, restrained copper, and clear Persian typography. Public booking pages prioritize hospitality and confidence. Staff pages prioritize scanability and quick, predictable actions. Use the same semantic colors, control heights, focus behavior, and spacing across both areas.

## Foundations

| Role            | Token                              | Current value    | Use                                   |
| --------------- | ---------------------------------- | ---------------- | ------------------------------------- |
| Page background | `background`                       | warm stone       | Main canvas                           |
| Surface         | `surface` / `card`                 | ivory            | Cards, forms, popovers                |
| Soft surface    | `surface-soft` / `muted`           | pale stone       | Secondary panels and grouped controls |
| Main text       | `foreground`                       | deep ink         | Body copy and labels                  |
| Secondary text  | `muted-foreground`                 | muted green gray | Help text and metadata                |
| Primary action  | `primary`                          | forest green     | Main actions and selected states      |
| Strong primary  | `primary-strong`                   | deep forest      | Headings and high emphasis            |
| Accent          | `accent-brand`                     | copper           | Editorial accent; use sparingly       |
| Highlight       | `highlight`                        | warm amber       | Small decorative highlights           |
| Border          | `border` / `input`                 | stone            | Card edges and form controls          |
| Success         | `success` / `success-soft`         | green            | Confirmed and available states        |
| Warning         | `warning` / `warning-soft`         | ochre            | Pending and caution states            |
| Error           | `destructive` / `destructive-soft` | red              | Validation and failure states         |
| Keyboard focus  | `ring`                             | copper           | Visible focus outline                 |

Tailwind v4 exposes these through the `@theme inline` mappings in `globals.css`. Prefer `bg-background`, `bg-surface`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, and related semantic utilities. Avoid raw hex values and palette utilities in components.

## Type and direction

- The site is Persian-first and RTL. Keep `<html lang="fa" dir="rtl">`; use logical Tailwind properties (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`) so layouts work in RTL.
- Use Vazirmatn Variable for interface and display text. Keep headings at 650–700 weight and body text at 16px or larger where practical.
- Use `dir="ltr"` or `<bdi>` for phone numbers, email addresses, references, and Latin identifiers.
- Use tabular numerals for prices and operational counts. Keep labels visible; placeholders are examples, never labels.

## Layout and spacing

- Use a centered content width up to 84rem with responsive horizontal gutters. Use `mx-auto w-full max-w-* px-4 sm:px-6 lg:px-10` rather than fixed viewport widths.
- Compose spacing from Tailwind's scale. Typical form/card padding is 4–8, section gaps 8–16, and field gaps 4–6.
- Start with a single-column mobile layout. Add two-column forms at `md` when both fields remain readable; reserve dense multi-column controls for `lg` and above.
- Keep booking summary information grouped in a card. On small screens, show the stay summary before the form; on wide screens, keep the summary visible beside the form.
- Keep long Persian labels and errors allowed to wrap. Set `min-w-0` on grid children and `break-words` on untrusted/user-provided text.

## Shape, surfaces, and elevation

- Controls use `rounded-xl`; standard cards use `rounded-2xl`; featured/public imagery may use `rounded-3xl`; status chips use `rounded-full`.
- Use a subtle border and surface contrast before adding a shadow. Reserve stronger elevation for menus, dialogs, and floating controls.
- Keep shadows soft and sparse. Do not combine blur, translucent layers, and multiple shadows on routine cards.

## Components and interaction

- Use the shared shadcn components in `components/ui` for buttons, fields, inputs, selects, cards, alerts, badges, and overlays. Extend them through variants or `className`, not one-off global selectors.
- Choose the shadcn `Button` or `ButtonLink` `variant` prop for its visual role (`default`, `outline`, `secondary`, `ghost`, or `destructive`). Use `className` for layout and sizing; do not add another `buttonVariants()` string on top of the component's default variant.
- Use `ButtonLink` for navigation that should look like an action button, and `Button` for form or in-place actions. Keep staff utility classes tied to the same `buttonVariants` so older compositions retain the shared size, contrast, focus, and disabled states.
- Use `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` from `components/ui/field` to keep label, hint, and validation structure consistent. Connect labels with `htmlFor` and controls with stable `id` values.
- Use `Input` for text, numeric, date, search, and other single-line entry; use `Textarea` for multi-line text; use `Checkbox` for independent boolean choices; and use `RadioGroup` with `RadioGroupItem` for mutually exclusive choices.
- Use the shared shadcn `Select` composition for searchable or custom popover selection. Use `NativeSelect` for simple option lists that benefit from native keyboard, mobile, and form behavior. Do not add raw form controls in feature pages; extend the shared primitive when a new control style is needed.
- Primary buttons use forest green, have a minimum 44px target, and include a clear disabled/loading state. Destructive actions use the destructive variant and should be visually distinct from ordinary navigation.
- Inputs and selects share a 48px height, 12px radius, visible border, semantic surface tokens, and copper focus ring. Pair every control with a visible label and adjacent help/error text.
- Use semantic `Alert` for status messages and `Badge` for compact state labels. Never encode state with color alone; include a text label or icon with accessible text.
- Every interactive control must work by keyboard, expose a visible focus indicator, and have a minimum 44px target. Do not rely on hover for essential information.
- Use Lucide icons through `lucide-react`; mark decorative icons `aria-hidden="true"` and provide labels for icon-only buttons.
- Keep transitions between 150–250ms, animate color/opacity/transform only, and respect reduced motion.

## Responsive and accessibility rules

- Check layouts at 375px, 768px, 1024px, and 1440px. Avoid horizontal page scrolling and prevent controls from shrinking below readable widths.
- Maintain at least 4.5:1 contrast for normal text. Use the semantic foreground tokens rather than muted colors for important content.
- Preserve heading order, landmarks, associated labels, inline validation, focus management, and live feedback for async actions.
- Reserve image aspect ratios to avoid layout shift. Use descriptive Persian alt text for meaningful hotel imagery and empty alt text for decorative imagery.

## Tailwind patterns

```tsx
<Card className="rounded-2xl border-border bg-surface p-5 shadow-none sm:p-6">
  <h2 className="text-xl font-bold text-primary-strong">مشخصات درخواست</h2>
  <p className="mt-2 text-sm leading-7 text-muted-foreground">راهنمای کوتاه</p>
</Card>

<div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
  <Field className="min-w-0 gap-2">
    <FieldLabel htmlFor="guest-phone">شماره موبایل</FieldLabel>
    <Input id="guest-phone" type="tel" dir="ltr" />
    <FieldDescription>شمارهٔ همراه ایران را وارد کنید.</FieldDescription>
  </Field>
</div>
```

## CSS policy

Use CSS only for the Tailwind import, theme tokens, font loading, and global document defaults such as box sizing and baseline focus behavior. Keep page and component presentation in Tailwind utilities and shared shadcn components. When migrating an older page, remove its CSS module import and file in the same change.

Radius utilities map to the design tokens: `rounded-xl` for controls, `rounded-2xl` for cards, and `rounded-3xl` for featured surfaces. Keep these mappings in `@theme inline` so Tailwind classes match the documented scale.
