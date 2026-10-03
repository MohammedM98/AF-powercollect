# Task: colour the row-menu icons at rest

## Goal

In the subscriber row "more" menu (بيانات المشترك، تعديل البيانات الشخصية، إضافة اشتراك، إرسال رسالة، تسجيل دفعة، إضافة تحميل، إضافة خصم، …) every icon tile is plain grey until the item is hovered or focused. Make each icon tile **coloured all the time**, in its own tone, so the actions are easy to tell apart at a glance.

- **At rest:** a soft tinted tile in the item's tone with a tone-coloured icon (e.g. a light-green tile with a green banknote for تسجيل دفعة).
- **On hover / keyboard focus:** keep the current behaviour: a solid tile in the tone with a white icon.
- **Locked or disabled items** (`lockedReason` / `disabled`): stay grey and faded, as they are now. Do not colour them.

## Where the code is

Only one file needs to change: `resources/js/Components/DataTable/RowMenu.jsx`.

- The `TONES` map (top of the file) holds the **hover-only** classes per tone.
- The icon tile is the `<span>` wrapping `<Icon name={item.icon} … />` inside `group.items.map(...)`. Its classes today:

```jsx
unavailable
    ? 'bg-gray-100 text-gray-500'
    : `bg-gray-100 text-gray-700 group-hover/item:text-white group-focus-visible/item:text-white ${TONES[item.tone] ?? TONES.graphite}`
```

The menu items and their tones are declared in `resources/js/Pages/Subscribers/Index.jsx` (`tone: 'graphite' | 'blue' | 'indigo' | 'sky' | 'emerald' | 'amber' | 'violet' | 'teal' | 'brand'`). **Do not change that file.** The tones are already set there; only the rendering changes.

## Implementation

1. Turn `TONES` into a map of `{ rest, active }` per tone. `active` is the existing hover/focus string, unchanged. `rest` is the new at-rest tile colours.
2. In the icon tile, when the item is available, use `rest` + `active` + `group-hover/item:text-white group-focus-visible/item:text-white` instead of the hard-coded `bg-gray-100 text-gray-700`. Keep the unavailable branch as it is.
3. Fall back to `TONES.graphite` when `item.tone` is missing or unknown (same as today).
4. Update the JSDoc above `TONES` and the line `` `tone` (see TONES) colours the item's icon on hover; dark by default.`` in the `RowMenu` docblock so they describe the new behaviour (tinted at rest, solid on hover/focus).

Suggested map. Use it as written:

```jsx
/**
 * The colours of an item's icon tile, by its `tone`: a soft tint of the
 * tone at rest, filled solid when the item is hovered or focused. Written
 * out whole so Tailwind keeps every class.
 */
const TONES = {
    graphite: {
        rest: 'bg-gray-100 text-gray-700',
        active: 'group-hover/item:bg-graphite-gradient group-focus-visible/item:bg-graphite-gradient',
    },
    blue: {
        rest: 'bg-blue-500/10 text-blue-600',
        active: 'group-hover/item:bg-blue-600 group-focus-visible/item:bg-blue-600',
    },
    indigo: {
        rest: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
        active: 'group-hover/item:bg-indigo-600 group-focus-visible/item:bg-indigo-600',
    },
    sky: {
        rest: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        active: 'group-hover/item:bg-sky-600 group-focus-visible/item:bg-sky-600',
    },
    emerald: {
        rest: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        active: 'group-hover/item:bg-emerald-600 group-focus-visible/item:bg-emerald-600',
    },
    amber: {
        rest: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        active: 'group-hover/item:bg-amber-600 group-focus-visible/item:bg-amber-600',
    },
    violet: {
        rest: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
        active: 'group-hover/item:bg-violet-600 group-focus-visible/item:bg-violet-600',
    },
    teal: {
        rest: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
        active: 'group-hover/item:bg-teal-600 group-focus-visible/item:bg-teal-600',
    },
    brand: {
        rest: 'bg-brand-500/10 text-brand-600',
        active: 'group-hover/item:bg-brand-gradient group-focus-visible/item:bg-brand-gradient',
    },
};
```

And the tile:

```jsx
const tone = TONES[item.tone] ?? TONES.graphite;

<span
    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] transition ${
        unavailable
            ? 'bg-gray-100 text-gray-500'
            : `${tone.rest} ${tone.active} group-hover/item:text-white group-focus-visible/item:text-white`
    }`}
>
```

## Traps: read before writing classes

- **`blue` is a custom 3-step palette.** `tailwind.config.js` sets `blue: scale('blue', [500, 600, 700])`, so `bg-blue-50`, `bg-blue-100`, `text-blue-400` etc. **do not exist** and will silently render nothing. Use only `blue-500/600/700`, with opacity modifiers (`bg-blue-500/10`). The blue CSS variables are already redefined for dark mode in `resources/css/app.css`, so no `dark:` variant is needed for blue.
- **`brand` and `gray` are CSS-variable palettes** that switch themselves in dark mode. Do not add `dark:` variants for them.
- **`graphite` stays dark in both themes**, so never use it as a text colour on the menu's surface. Keep the graphite tone neutral grey at rest (as above).
- **Use translucent tints (`/10`), not `-50` shades**, so the tiles read in both light and dark themes. This matches `resources/js/Components/DataTable/StatusPill.jsx`.
- **Write every class name out in full.** Do not build class names with template strings like `` `bg-${tone}-500/10` ``. Tailwind (v3, JIT) only keeps classes it can find literally in the source.
- Dark mode is class-based (`darkMode: 'class'`), so `dark:` variants work as written.

## Out of scope

- No changes to `Index.jsx`, `RowActionsMenu.jsx`, the icon set, labels, shortcuts, or layout.
- No new dependencies, no new files.
- No PHP changes, so no Pint run and no PHPUnit test needed. This is a styling-only change.

## Done when

- Opening the row menu on the Subscribers page (`/subscribers`, the "…" button on a row) shows every available item's icon tile tinted in its tone. In the screenshot set: بيانات المشترك grey, تعديل البيانات الشخصية blue, إضافة اشتراك indigo, إرسال رسالة sky, تسجيل دفعة green, إضافة تحميل amber, إضافة خصم violet.
- Hovering or arrowing onto an item still fills its tile solid with a white icon.
- Items shown with "بدون صلاحية" or a disabled hint stay grey and faded.
- Looks right in both light and dark themes, and on the phone bottom-sheet layout.
- `npm run build` succeeds.
