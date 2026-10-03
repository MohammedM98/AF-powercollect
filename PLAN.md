# PLAN: Permission to erase a single transaction for good

## Goal

Besides the normal "delete" (cancel with a reversal and a reason, which keeps a
trace), a user holding a separate permission can erase **one** line of a
subscriber's account entirely: nothing stays on the statement, and the balance
is as if it was never recorded.

## Permission

- New key `collections.force_delete`, "Permanently Delete Transactions" /
  «الحذف النهائي للحركات المالية», under Collections on the permissions page, in
  the sensitive (danger) box.
- Given to nobody by default. The Super Admin holds it like every permission;
  anyone else needs it ticked.
- Works only within the user's own branch (any branch for the Super Admin).
- Separate from `collections.delete`, which still only cancels with a reversal.

## What it does

- Button "حذف نهائي" on the **last line only** — the one at the bottom of the
  statement table — and only for users with the permission.
- Opens a confirmation form with a red warning, the line, the balance after,
  and a **required reason**. The reason is not shown on the statement; it is
  written to the application log with the line's details and who erased it.
- Erases that line. If the last line is a reversal (قيد عكسي), the cancelled
  line it reverses goes with it, so the balance stays right.

## Limits

- Older lines can never be erased this way; once a newer line exists, the
  older ones are only cancelled with a reversal.
- A payment already counted in a financial closing cannot be erased.
- A payment's voucher number is not reused, so a gap remains in the numbering.
- Erasing a weekly reading's charge line leaves the reading itself approved.

## Where

`PermissionKey`, `SubscriberTransactionPolicy::forceDelete`,
`SubscriberTransaction::isErasable()` / `erase()`,
`SubscriberTransactionController::forceDestroy`,
`ForceDeleteSubscriberTransactionRequest`, route
`subscribers.transactions.force-destroy`, `ForceDeleteTransactionModal.jsx`.
