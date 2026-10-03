# PLAN: Edit, correct, cancel and erase a transaction — four clear actions

## 1. The idea in one sentence

Ask **"does the change touch the money?"**

- No → **amend the details in place** and keep a visible history.
- Yes → **cancel with a reversal** (and enter the right line if needed).
- Never should have existed → **cancel**. Just made, and last → **erase**.

## 2. The four actions

| | Action (Arabic) | Icon (`Icon name`) | Colour | Use it when | What happens to the statement | Balance |
|---|---|---|---|---|---|---|
| ✏️ | **تعديل البيانات** | `pencil` | blue | Wrong bank / wallet, reference number, sender name, notes | Same line, marked «معدّلة»; old → new values kept in its history | unchanged |
| 🔁 | **تصحيح الحركة** | `repeat` | amber | Wrong amount, currency, cash vs transfer, type | Old line cancelled + reversal, right line entered under it | follows the new line |
| ⊘ | **إلغاء الحركة** | `close` | burgundy | Duplicate, money not received, refunded, wrong subscriber | Line stays, struck through, with reason + a reversal (قيد عكسي) | reversed |
| 🗑 | **حذف نهائي** | `trash` | dark red | A mistake just made, **last line only** | Line disappears, no trace on the statement | as if never recorded |

"إلغاء الحركة" is the current "حذف حركة", renamed so nobody thinks it erases.
"حذف نهائي" already exists (permission `collections.force_delete`).

## 3. What the user sees

The row's ⋯ menu, each item with its icon, colour and a one-line hint so the
user knows what pressing it does:

```
 12/10  دفعة · تحويل بنكي · 80 ₪ · جوال باي  [✏️ معدّلة]        ⋯
                                                              │
  ┌─────────────────────────────────────────────────────────┐ │
  │ ✏️  تعديل البيانات     البنك، المرجع، المرسل — الرصيد لا يتغيّر │◄┘
  │ 🔁  تصحيح الحركة      المبلغ أو الطريقة — يُلغى القديم ويُسجَّل الصحيح │
  │ ⊘  إلغاء الحركة       تبقى ظاهرة مشطوبة مع السبب          │
  │ 🗑  حذف نهائي          آخر حركة فقط — بلا أي أثر          │
  └─────────────────────────────────────────────────────────┘
```

- Items the user may not use are hidden; ones that don't apply now are shown
  faded with the reason (e.g. «بعد إغلاق اليوم», «ليست آخر حركة»).
- Each form's header repeats the action's icon and colour, and its confirm
  button says the same word (e.g. «حفظ التعديل», «نعم، ألغِ الحركة»).

### Amend form (تعديل البيانات)

```
 ✏️ تعديل بيانات الدفعة                         [ لا يغيّر الرصيد ]
 ───────────────────────────────────────────────────────────
  المبلغ        80 ₪        🔒 (للقراءة فقط)
  الطريقة       تحويل بنكي   🔒 (للقراءة فقط)
  ───────────────────────────────────────────────────────
  البنك المحوَّل له   [ بنك فلسطين ▾ ]   ← عُدّل
  رقم مرجعي         [ TR-1042        ]
  اسم المرسل         [ Ahmad          ]
  ملاحظات            [                ]
  سبب التعديل *       [ خطأ في اختيار البنك ]
  ───────────────────────────────────────────────────────
  الرصيد قبل: 120 ₪ مدين   →   بعد: 120 ₪ مدين (بدون تغيير)
                                   [ حفظ التعديل ]  [ إلغاء ]
```

On the statement, hovering «معدّلة ⓘ» (icon `history`) shows:

```
 البنك:   جوال باي ← بنك فلسطين
 عدّلها سامي · 12/10 14:20 · السبب: خطأ في اختيار البنك
```

## 4. Rules

1. **Amend** may change only: destination bank, sender bank, sender name,
   reference number, notes. Never amount, currency, method, date, type,
   subscriber.
2. **Cash ↔ transfer and currency are not amend.** Closings count cash and
   transfers separately, so those changes use **تصحيح** (reversal + new line).
3. Amend needs a **reason** (free text) and keeps who / when / old → new.
4. Amend is **blocked once the line is in a closed day**; the menu item shows
   «بعد إغلاق اليوم». Cancel (reversal) still works, as it adds a line today.
5. A line may be amended several times; the history lists all of them.
6. Permissions: amend uses the existing **Edit Transactions**
   (`collections.correct`); correct = same; cancel = **Delete Transactions**
   (`collections.delete`); erase = **Permanently Delete Transactions**
   (`collections.force_delete`, last line only).

## 5. Work to do

1. Migration: `transaction_amendments` (transaction_id, user_id, changes JSON
   `{field: [old, new]}`, reason, created_at).
2. `SubscriberTransaction::amend(User, array $fields, string $reason)`; allowed
   fields and "not in a closed day" checked there; model policy `amend`.
3. Route `PATCH /subscribers/{subscriber}/transactions/{transaction}/details`,
   `AmendSubscriberTransactionRequest`, controller action.
4. Statement entries gain `canAmend`, `amendments` (history) and
   `isAmended`; show the «معدّلة ⓘ» badge and its popover.
5. `AmendTransactionModal.jsx`: money fields read-only with 🔒, editable
   details, required reason, "balance unchanged" panel.
6. Row menu: the four items above with icons, colours and hints; rename
   «حذف» to «إلغاء الحركة» in the cancel form and messages.
7. Tests: amend changes details but not balance; refused for amount / method;
   refused in a closed day; history recorded; permission required.

## 6. Not decided yet

- Whether amend should also apply to charges, discounts and clearings (they
  have only a note to amend) — proposal: payments only.
- Whether closed-day amendments may be allowed for a higher permission.
