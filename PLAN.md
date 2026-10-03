# PLAN: Group the statement action buttons into one dropdown

## Goal

On the subscriber statement (page `Subscribers/Statement.jsx` and modal
`Subscribers/StatementModal.jsx`) the four buttons — إضافة تحميل, إضافة خصم,
مقاصة, تسجيل دفعة — are separate and differently sized. Group them into a
single dropdown menu, with equal-size items, each in its own colour.

## Instructions

1. **One dropdown** — replace the row of buttons in `StatementActions`
   (`resources/js/Pages/Subscribers/StatementForms.jsx`) with a single trigger
   button, "إضافة حركة", that opens a menu listing the actions the user may
   use. Close on outside click, Esc, or after choosing an item.
2. **Same size** — every menu item has the same width and height (full menu
   width, one fixed row height) and the same icon size.
3. **Colours** (same tones as the quick row menu in the subscribers table):
   - تسجيل دفعة — **green** (emerald). Its menu item is the green one; the old red
     brand-gradient button is gone.
   - تحميل حركة — amber.
   - إضافة خصم — violet.
   - مقاصة — teal.
4. **Permissions unchanged** — payment shows only with `canRecordPayment`;
   charge, discount and clearing only with `canAdjustBalance`. If the user has
   neither, render nothing.
5. **Rename** "إضافة تحميل" to **"تحميل حركة"** everywhere it is a label for
   adding a charge:
   - the statement dropdown,
   - the quick dropdown (row "more" menu) in the subscribers table
     (`Subscribers/Index.jsx`, group "الحساب المالي"),
   - the charge modal's title (`Subscribers/ChargeModal.jsx`).
   The permission name "إضافة تحميل وخصم" is a permission, not this label — leave it.
6. **Quick dropdown in the table** — add "مقاصة" (teal) to the
   "الحساب المالي" group, after "إضافة خصم", so it matches the statement menu.
7. No backend changes; no new dependencies.

## Verify

- `npm run build` succeeds.
- Open a statement: one "إضافة حركة" button; items are equal in size and
  coloured as above; payment is green.
- Subscribers table → row menu: "تحميل حركة" and "مقاصة" present.
