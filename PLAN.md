# PLAN: Statement actions dropdown, and deleting wrong lines with a reason

## 1. Statement actions dropdown

- One button, "إضافة حركة", opens a menu (`StatementActions` in
  `resources/js/Pages/Subscribers/StatementForms.jsx`).
- Items follow the site's existing menu-item pattern (`RowMenu`): same row
  size, a 30px icon chip, same hover. Only the colour differs per action:
  - تسجيل دفعة — green
  - تحميل حركة — amber
  - إضافة خصم — violet
  - مقاصة — teal
- "إضافة تحميل" is renamed **تحميل حركة** (statement dropdown, row menu in the
  subscribers table, charge form title). "مقاصة" was added to the row menu.
- Permissions are unchanged.

## 2. Delete = cancel with a reversal, never erase

Best practice kept as is: a deleted line stays in the statement, struck
through, with who, when and why; a reversal line (قيد عكسي) takes its amount
off the balance. A correction cancels the line and records the right one.

## 3. Which lines may be deleted

Anyone holding "Delete Transactions" (`collections.delete`), in their own
branch (any branch for the Super Admin), may now delete:

- payments, charges, discounts, clearings (as before),
- **the registration/subscription fee**,
- **a weekly reading's charge line** and its **standing-discount line**.

Reversals and already-cancelled lines still cannot be deleted. Fees and
readings can be deleted but not edited (`isCancellable()` vs
`isCorrectable()` in `SubscriberTransaction`). The line's source key is kept,
so the flow that billed it never bills it again.

## 4. Reasons

The user picks a reason and must write a free-text explanation, shown under
the line in the statement. Reasons depend on the line (`forDeletionOf()` in
`CorrectionReason`):

- Payment: wrong subscriber, duplicate, money not received,
  **دفعة مستردة للمشترك** (new), other.
- Weekly reading / its discount: **قراءة مُدخلة بالخطأ** (new), wrong
  subscriber, duplicate, other.
- Registration fee: **رسوم مُلغاة** (new), wrong amount, wrong subscriber,
  duplicate, other.
- Charge, discount, clearing: wrong subscriber, duplicate, other.

## 5. Not done (decide later)

- Blocking deletion on a day that is already closed (financial closing).
- A separate permission just for fees and readings.
- The reading itself stays approved when only its charge line is deleted.
