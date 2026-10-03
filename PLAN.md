# PLAN: Registration area pick, unique transfer reference, one voucher column, corrections at the end

Four changes. Each says what is wrong today (checked in the code), what to
build, and what to test. Section 6 lists the points I need you to confirm.

---

## 1. New subscriber: show "منطقة 2" at once, then just pick the طبلون

**Today** (`resources/js/Pages/Subscribers/SubscriberForm.jsx`)
- The branch's "المنطقة" is shown read-only, and "منطقة 2" is a dropdown whose
  first choice is "— بلا منطقة 2 —".
- The "رقم الطبلون" field stays **hidden until a منطقة 2 is chosen**
  (`showMeterBoxField`). So the user needs two steps before the real choice.

**Build**
1. Show "منطقة 2" as soon as the branch is known (own branch for branch users;
   after picking a branch for the Super Admin). If the branch's area has
   **one** منطقة 2, select it automatically.
2. Show "رقم الطبلون" immediately, listing the طبلونات of the selected
   منطقة 2, or of **all** the branch's منطقة 2 when none is selected.
3. Picking a طبلون sets its منطقة 2 by itself, so the user can do only that one
   pick. Changing منطقة 2 afterwards clears a طبلون that is not in it.
4. Remove "— بلا منطقة 2 —" from new-subscriber registration (keep it only when
   editing a subscriber who has none).

**Test:** a branch user opens the form and sees منطقة 2 and the طبلون list
without clicking; picking a طبلون fills منطقة 2; one-area branch is preselected.

---

## 2. Transfer reference number must be unique

**Today:** `reference_number` is only `required` (bank/wallet payments) and
`max:100`, in `StoreSubscriberPaymentRequest`. Nothing stops the same transfer
being recorded twice. The mobile app records payments too
(`MobileCollectionController`), and corrections have their own request.

**Build**
- A reference may be used by **one standing payment only**. Compared after
  cleaning: trimmed, spaces removed, upper-cased (`TR 1042` = `tr1042`).
- A **cancelled or erased** payment no longer holds its reference, so a wrong
  line can be corrected with the same reference.
- Applies to: the web payment form, the mobile payment API, and the correction
  form (a corrected line may keep its own reference).
- Message (Arabic): «هذا الرقم المرجعي مسجَّل مسبقًا على دفعة أخرى» with the
  existing payment's voucher number and subscriber, so the user can find it.
- Safe against two users saving at the same moment: check inside the
  transaction, backed by a database unique index on a cleaned
  `active_reference` column that is emptied when the line is cancelled.
- Scope question → section 6, point A.

**Tests:** duplicate refused (web and mobile); different case/spaces refused;
reuse allowed after cancel; correction keeping its own reference works.

---

## 3. Statement table: one voucher column

**Today** (`AccountStatement.jsx`): two columns, «السند اليدوي» and «رقم السند».

**Build**
- Delete the «السند اليدوي» column; keep one column **«رقم السند»**.
- Nothing is lost: when a line has a manual voucher number, it shows small
  under the system number (`يدوي: 1234`). Search still finds both
  (`accountStatement.js`).
- Same change in the printed/exported statement if it lists the column.

**Tests:** header has a single voucher column; a manual number still appears
and is searchable.

---

## 4. Corrections: the new line goes to the end, linked to the old one

The principle: the history is never rearranged. Old lines stay where they
were; the right line is added **at the bottom**, and the two point at each
other until the subscriber's money matters are closed.

```
  #   التاريخ   البيان                      مدين   دائن   الرصيد
  1   10/10    رسوم اشتراك                  50            50
  2   11/10    دفعة · بنك فلسطين            ·    80       −30   ⟲ صُحّحت ← #4
  3   12/10    قيد عكسي لـ #2               80            50    (مشطوبة)
  4   12/10    دفعة · جوال باي  [تصحيح لـ #2 ↑]   100    −50   ← new line, at the bottom
```

**Today:** the replacement is already added at the end (newest), but the old
line and its reversal are **folded away** by default (`foldCorrections`), so the
user sees only the new line and the link to the old one is hidden.

**Build**
1. While the subscriber's lines are **not yet finalised** (the day of those
   lines is not closed), show the old line, its reversal and the new line,
   all unfolded, in time order. Nothing moves; the balance column stays right.
2. Old line: crossed out, badge «⟲ صُحّحت ← #4». Reversal: «قيد عكسي لـ #2».
   New line at the bottom: badge «تصحيح لـ #2 ↑». Clicking a badge scrolls to
   and highlights the other line.
3. Amounts of the old line and its reversal stay as recorded; only the
   new line carries the corrected amount.
4. After the lines are finalised by a closing, they fold by default (the
   «عرض السجل» button still opens them), as today.
5. The «حذف نهائي» of the last line is unchanged.

**Tests:** after a correction the statement order is old, reversal, new; the
new line is last; links exist both ways; folded only after closing.

---

## 5. Order of work and files

1. Reference uniqueness (backend + migration + tests).
2. Voucher column (small, front end).
3. Registration form flow.
4. Corrections display and links.

Files: `SubscriberForm.jsx`, `StoreSubscriberPaymentRequest.php`,
`CorrectSubscriberTransactionRequest.php`, `MobileCollectionController.php`,
`SubscriberTransaction.php`, a new migration for `active_reference`,
`AccountStatement.jsx`, `resources/js/lib/accountStatement.js`,
`BuildsSubscriberStatement.php`.

---

## 6. Please confirm (my questions and additions)

- **A. How strict is "unique"?** One reference per payment across the whole
  company (my proposal), or unique per bank/wallet (two banks may reuse
  numbers)? Per bank is more correct if different banks can issue the same
  number; the company-wide rule is safer against duplicates.
- **B. "Template" in point 1:** I read it as the **طبلون** (meter box). Correct?
- **C. "Finalised":** I take it to mean the closing of the day those lines
  belong to. Or do you mean when the subscriber's balance reaches zero?
- **D. Manual voucher:** is it right to keep it as a small line under the
  voucher number, rather than removing it completely?
- **E. Addition:** also warn (not block) when the same amount and sender name
  are saved twice on the same day, since that is often a duplicate with a
  mistyped reference.
- **F. Addition:** show the same reference check live while the collector
  types it, before pressing save.
