# PLAN: Meter box pick at registration, unique transfer reference, one voucher column, corrections kept visible

Four changes. For each: what is wrong today (checked in the code), what to
build, and what to test. Decisions already made with the owner are marked
**Decided**.

---

## 1. New subscriber: show the branch's "منطقة 2" at once, user only picks the طبلون

**Today** (`resources/js/Pages/Subscribers/SubscriberForm.jsx`)
- The branch's "المنطقة" is read-only; "منطقة 2" is a dropdown whose first
  option is "— بلا منطقة 2 —".
- The "رقم الطبلون" field stays **hidden until a منطقة 2 is chosen**
  (`showMeterBoxField`), so the user needs two steps before the real choice.

**Build**
1. Show "منطقة 2" as soon as the branch is known (the user's own branch; for
   the Super Admin, after picking a branch). If the branch's area has **one**
   منطقة 2, select it automatically.
2. Show "رقم الطبلون" immediately, listing **only the meter boxes of the
   user's branch** (of the selected منطقة 2, or of all the branch's منطقة 2 when
   none is selected).
3. Picking a meter box sets its منطقة 2 by itself, so the user makes one
   choice. Changing منطقة 2 afterwards clears a meter box that is not in it.
4. Remove "— بلا منطقة 2 —" from new-subscriber registration (keep it only when
   editing a subscriber who has none).

**Test:** a branch user opens the form and sees منطقة 2 and the meter box list
with no extra clicks; boxes of other branches never appear; picking a box fills
منطقة 2; a branch with one منطقة 2 has it preselected.

---

## 2. Transfer reference number must be unique

**Decided:** unique across **all banks and wallets** (one reference, one payment
in the whole company). Cash payments have no reference (they use the voucher
number); bank and wallet transfers use the reference number.

**Today:** `reference_number` is only `required` (bank/wallet payments) and
`max:100` in `StoreSubscriberPaymentRequest`. Nothing stops the same transfer
being recorded twice. The mobile app records payments too
(`MobileCollectionController`), and corrections have their own request.

**Build**
- A reference belongs to **one standing payment only**. Compared after
  cleaning: trimmed, spaces removed, upper-cased (`TR 1042` = `tr1042`).
- A **cancelled or erased** payment releases its reference, so a wrong line
  can be corrected with the same reference.
- Applies to the web payment form, the mobile payment API and the correction
  form (a corrected line may keep its own reference).
- Error (Arabic): «هذا الرقم المرجعي مسجَّل مسبقًا على دفعة أخرى», naming the
  existing payment's voucher number and subscriber so it can be found.
- Safe against two users saving at the same moment: checked inside the
  transaction and backed by a database unique index on a cleaned
  `active_reference` column that is emptied when the line is cancelled.
- **Live check (Decided: yes):** while the collector types the reference, the
  form asks the server and shows "already used by voucher N" before saving.
  Saving still re-checks.
- **Duplicate warning (Decided: warn, never block):** when the same amount and
  sender name were already saved on the same day, show a yellow warning with a
  link to that payment; the user can still save.

**Test:** duplicate refused (web and mobile); same reference with different
case or spaces refused; reuse allowed after cancel; correction keeping its own
reference works; the live-check endpoint answers free / used; the warning
appears but does not block.

---

## 3. Statement table: one voucher column

**Decided:** the manual voucher and the voucher number are the same thing for
cash. Cash payments are identified by the voucher number; bank and wallet
transfers by the reference number (their own existing column).

**Today** (`AccountStatement.jsx`): two columns, «السند اليدوي» and «رقم السند».

**Build**
- Delete the «السند اليدوي» column; keep one column **«رقم السند»**. It shows the
  manual voucher number when the collector typed one, otherwise the system
  voucher number.
- The «الرقم المرجعي» column stays as is, for transfers.
- Search still finds both numbers (`resources/js/lib/accountStatement.js`).
- Same change in the printed statement if it lists the column.

**Test:** one voucher column; a manual number is shown in it and found by
search; a line without one shows the system number.

---

## 4. Corrections: new line at the end, linked to the line it corrects

**Decided:** "until the financial matters are finished" means until the project's
design is finished and the company has given its opinion. Until then nothing
about corrections is hidden or folded by default; what to fold after approval
is decided later with the company.

The history is never rearranged. Old lines stay where they were, with their
reversal; the right line is added **at the bottom**, and the lines point at
each other.

```
  #   Date    Description                         Debit  Credit  Balance
  1   10/10   Subscription fee                     50             50
  2   11/10   Payment · Bank of Palestine                  80    −30   ⟲ corrected → #4
  3   12/10   Reversal of #2                       80             50   (struck through with #2)
  4   12/10   Payment · Jawwal Pay [corrects #2 ↑]        100    −50   ← new line, at the bottom
```

**Today:** the replacement is already added at the end, but the old line and its
reversal are **folded away by default** (`foldCorrections`), so the user sees
only the new line and the link between them is hidden.

**Build**
1. Show the old line, its reversal and the new line **unfolded by default**, in
   time order. The balance column stays correct on every line.
2. Old line: struck through with a badge «⟲ صُحّحت ← #4». Reversal: «قيد عكسي لـ #2».
   New line, at the bottom: badge «تصحيح لـ #2 ↑». Clicking either badge
   scrolls to and highlights the other line.
3. The old line and its reversal keep the amounts as recorded; only the new
   line carries the corrected amount.
4. A manual «طي السجل» button may still fold a corrected group, but nothing is
   folded unless the user asks.
5. Erasing the last line («حذف نهائي») is unchanged.

**Test:** after a correction the order is old line, reversal, new line; the new
line is last; the links exist both ways; nothing is folded by default.

---

## 5. Order of work and files

1. Reference uniqueness, live check and duplicate warning (back end,
   migration, small endpoint, form, tests).
2. Voucher column (small front-end change).
3. Registration form flow.
4. Corrections display and links.

Files: `SubscriberForm.jsx`, `StoreSubscriberPaymentRequest.php`,
`CorrectSubscriberTransactionRequest.php`, `MobileCollectionController.php`,
`SubscriberTransaction.php`, a new migration for `active_reference`,
`PaymentModal.jsx`, `AccountStatement.jsx`,
`resources/js/lib/accountStatement.js`, `BuildsSubscriberStatement.php`, routes.

---

## 6. Open points (none block starting)

- Should a **manual voucher number** also be unique (so two cash payments
  cannot carry the same paper voucher)? Not asked; proposed, since it is the
  cash equivalent of the transfer reference.
- Mobile app: it must show the same "reference already used" message; the
  mobile client needs a small update after the API change.
