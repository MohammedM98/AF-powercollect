# PLAN: National ID + Initial Meter Reading on Subscriber Registration

## 1. Feature goal and scope

Subscriber registration is missing a national ID field, and the existing
`previous_reading` column is ambiguously named for what it actually represents:
the meter's baseline reading captured once at registration (not a recurring
"previous reading" that a future billing cycle would also need). This plan:

- Adds a required, unique, 9-digit **national ID** to subscribers.
- Renames `previous_reading` → `initial_reading` (column, model, requests,
  controller, factory, frontend, validation language) and makes it a required
  field going forward.

Every other field the registration flow needs (name, address, branch, meter
box, meter number, subscription fee) already exists on the `subscribers`
table from prior work — confirmed by reading
`database/migrations/2026_09_19_090002_create_subscribers_table.php`,
`..._090003_add_extended_fields_to_subscribers_table.php`, and
`app/Http/Requests/{Store,Update}SubscriberRequest.php`. This plan does not
touch those.

Out of scope: introducing a separate `Meter` entity, billing/Charge logic
that will eventually consume `initial_reading`, and anything beyond these two
fields. See §8.

## 2. Database changes, relationships, and constraints

Two new migrations, in this order (today's date convention matches the
existing `YYYY_MM_DD_HHMMSS_*` files under `database/migrations/`):

**`2026_09_21_110000_add_national_id_to_subscribers_table.php`**
```php
Schema::table('subscribers', function (Blueprint $table) {
    $table->string('national_id', 9)->nullable()->unique()->after('full_name');
});
```
- Nullable at the DB level (a unique index on a nullable column still allows
  at most one NULL... actually allows multiple NULLs and blocks duplicate
  non-null values — correct behavior for existing/demo rows that predate
  this field). **Required is enforced at the validation layer** (§3), not
  the schema, so no backfill migration is needed and no existing row breaks.
- Down: `dropUnique` + `dropColumn('national_id')`.

**`2026_09_21_110001_rename_previous_reading_to_initial_reading_on_subscribers_table.php`**
```php
Schema::table('subscribers', function (Blueprint $table) {
    $table->renameColumn('previous_reading', 'initial_reading');
});
```
- Laravel 13's schema builder renames columns natively (MySQL/Postgres/SQLite)
  without `doctrine/dbal` — do not add that package.
- Column stays `nullable unsigned integer` at the DB level, same reasoning as
  above: required is enforced in the Form Requests, not via a `->change()`
  call (which *would* need `doctrine/dbal`).
- Down: `renameColumn('initial_reading', 'previous_reading')`.

No new tables, no new relationships, no foreign keys.

## 3. Backend changes: routes, controllers, validation, business rules

No route changes — `Route::resource('subscribers', ...)` already covers
index/create/store/edit/update.

**`app/Models/Subscriber.php`**
- Update the `#[Fillable([...])]` attribute: add `'national_id'`, replace
  `'previous_reading'` with `'initial_reading'`.
- No new casts needed (national_id is a plain string; initial_reading was
  never cast).

**`app/Http/Requests/StoreSubscriberRequest.php`**
- Add: `'national_id' => ['required', 'string', 'regex:/^\d{9}$/', Rule::unique('subscribers', 'national_id')]`.
- Replace `'previous_reading' => ['nullable', 'integer', 'min:0']` with
  `'initial_reading' => ['required', 'integer', 'min:0']`.

**`app/Http/Requests/UpdateSubscriberRequest.php`**
- Same `national_id` rule, but
  `Rule::unique('subscribers', 'national_id')->ignore($subscriber->id)`.
- Same `initial_reading` rule (required).

**`app/Http/Controllers/SubscriberController.php`**
- In `editableFields()`: add `'national_id' => $subscriber->national_id,`
  and replace `'previous_reading' => $subscriber->previous_reading,` with
  `'initial_reading' => $subscriber->initial_reading,`.
- No other controller logic changes — `store`/`update` already pass
  `$request->validated()` straight through to `create`/`update`.

**Business rules**
- National ID must be exactly 9 digits, unique across all subscribers
  (branch-independent — a person has one national ID regardless of branch).
- Initial reading must be a non-negative integer and is now mandatory for
  every subscriber, with or without a meter box already assigned (a
  subscriber can still be registered before a meter box exists, per the
  existing `test_data_entry_can_register_a_subscriber_without_a_meter_box_yet`
  behavior — that is unaffected).

**`database/factories/SubscriberFactory.php`**
- Add `'national_id' => fake()->unique()->numerify('#########'),`.
- Add `'initial_reading' => fake()->numberBetween(0, 10000),` (was previously
  omitted from the factory entirely).

## 4. Roles, permissions, and branch-level access restrictions

No changes. This feature adds fields to an existing resource; it does not
introduce a new permission, role, or access boundary. `SubscriberPolicy` and
`PermissionKey::{ViewSubscribers,CreateSubscribers,UpdateSubscribers}`
continue to gate this exactly as they do today. National ID is not
branch-scoped for uniqueness (a national ID is unique system-wide, not
per-branch) — confirm this matches business expectations before Codex
implements; flagged again in §8 as the one assumption in this plan.

## 5. Frontend changes, following existing UI conventions

Four files carry the field shape today and must all be updated together
(confirmed by reading each): `SubscriberForm.jsx` (shared field UI, used by
both the modal and the dedicated pages), `SubscriberModal.jsx` (`BLANK` +
edit-mode initial data), `Create.jsx` (`useForm` defaults), `Edit.jsx`
(`useForm` initial data from the `subscriber` prop).

**`resources/js/Pages/Subscribers/SubscriberForm.jsx`**
- Add a new `Field` for `national_id`, placed immediately after the
  `full_name` field: label `"الرقم الوطني"`, `required`, `dir="ltr"`,
  `inputMode="numeric"`, `maxLength={9}` (client-side hint only — the server
  regex is the real gate).
- Rename the `previous_reading` field to `initial_reading` (same `TextInput
  type="number"` control), and change its label from `"القراءة السابقة"` to
  `"القراءة الابتدائية"` and mark it `required` (drop the `required={false}`
  default — currently it has no `required` prop at all, i.e. optional).

**`resources/js/Pages/Subscribers/Create.jsx`**
- In the `useForm({...})` defaults: add `national_id: ''`, rename
  `previous_reading: ''` to `initial_reading: ''`.

**`resources/js/Pages/Subscribers/Edit.jsx`**
- In the `useForm({...})` initial data: add `national_id: subscriber.national_id`,
  rename `previous_reading: subscriber.previous_reading ?? ''` to
  `initial_reading: subscriber.initial_reading ?? ''`.

**`resources/js/Pages/Subscribers/SubscriberModal.jsx`**
- Same two changes as `Edit.jsx`, applied to both the `BLANK` constant and
  the `isEdit` branch of `useForm(...)`.

**`lang/ar/validation.php`**
- Change the `'previous_reading' => 'القراءة السابقة'` custom-attribute entry
  to `'initial_reading' => 'القراءة الابتدائية'`.
- Add `'national_id' => 'الرقم الوطني'`.

No new components, no new dependencies, no layout/style changes — this
follows the existing modal + shared-form-component convention exactly as
built for every other resource (Branches, Meter Boxes, Tariffs, etc.).

## 6. Files to create or modify, ordered implementation steps

1. Create migration: `add_national_id_to_subscribers_table.php`.
2. Create migration: `rename_previous_reading_to_initial_reading_on_subscribers_table.php`.
3. Run `php artisan migrate` locally to confirm both apply cleanly against
   the current schema (SQLite in tests, whatever `DB_CONNECTION` is set to
   locally).
4. Update `app/Models/Subscriber.php` (`Fillable` list).
5. Update `app/Http/Requests/StoreSubscriberRequest.php`.
6. Update `app/Http/Requests/UpdateSubscriberRequest.php`.
7. Update `app/Http/Controllers/SubscriberController.php` (`editableFields()`).
8. Update `database/factories/SubscriberFactory.php`.
9. Update `lang/ar/validation.php`.
10. Update `resources/js/Pages/Subscribers/SubscriberForm.jsx`.
11. Update `resources/js/Pages/Subscribers/Create.jsx`.
12. Update `resources/js/Pages/Subscribers/Edit.jsx`.
13. Update `resources/js/Pages/Subscribers/SubscriberModal.jsx`.
14. Update existing tests that POST to `subscribers.store` without the new
    required fields (§7) — both in
    `tests/Feature/Subscribers/SubscriberAuthorizationTest.php`.
15. Add new test file `tests/Feature/Subscribers/SubscriberValidationTest.php`
    (§7).
16. Run `php artisan test` and `npm run build` to verify.

## 7. Acceptance criteria and required tests

**Acceptance criteria**
- Creating a subscriber without `national_id`, or with a value that isn't
  exactly 9 digits, is rejected with a validation error.
- Creating two subscribers with the same `national_id` is rejected on the
  second one.
- Creating a subscriber without `initial_reading` is rejected.
- All previously-passing behavior (branch scoping, permission checks,
  meter-box-optional registration) is unaffected.
- `php artisan test` passes in full; `npm run build` succeeds.

**Tests to update** (existing file
`tests/Feature/Subscribers/SubscriberAuthorizationTest.php`):
- `test_data_entry_can_register_a_subscriber_in_their_own_branch`: add
  `'national_id' => '123456789'` and `'initial_reading' => 100` to the POST
  payload.
- `test_data_entry_can_register_a_subscriber_without_a_meter_box_yet`: same
  two fields added (use a different `national_id`, e.g. `'987654321'`, to
  avoid a false-negative unique collision between the two tests).

**New tests to add** (new file
`tests/Feature/Subscribers/SubscriberValidationTest.php`):
- `test_national_id_is_required`
- `test_national_id_must_be_exactly_nine_digits` (assert both a shorter
  numeric value and a value containing letters are rejected)
- `test_national_id_must_be_unique_across_subscribers`
- `test_national_id_uniqueness_ignores_the_current_subscriber_on_update`
  (editing a subscriber without changing their own `national_id` must not
  trigger a false unique-collision against themselves)
- `test_initial_reading_is_required`
- `test_initial_reading_must_be_a_non_negative_integer`

## 8. Anything explicitly out of scope

- No separate `Meter` table/entity — `meter_number` stays a plain column on
  `subscribers`, as it is today. That's a larger structural change (see the
  five-stage data-model discussion) and not part of this feature.
- No backfill of `national_id`/`initial_reading` for any pre-existing
  subscriber rows (dev/demo data only at this stage).
- No billing/Charge logic that will eventually read `initial_reading` —
  that belongs to a future Billing-stage plan.
- No changes to `SubscriberPolicy`, `PermissionKey`, or branch-scoping rules.
- No new Composer or npm packages (specifically: no `doctrine/dbal` — see §2
  on why it's not needed here).
- Stale, unused Blade views under `resources/views/subscribers/` (the
  resource controller renders Inertia/React exclusively; these Blade
  templates appear to be dead leftovers from before that conversion) are
  **not** touched by this plan. Flagging for awareness — recommend a
  separate cleanup task, not bundled into this feature.
- **One open assumption, flagged per your instructions rather than silently
  decided**: national ID uniqueness is enforced system-wide (across all
  branches), not per-branch. If two different branches should be allowed to
  each register a subscriber under the same national ID (e.g. duplicate
  paper records before a merge), tell me before Codex implements — it
  changes the unique constraint from a plain column index to a composite
  `(branch_id, national_id)` index and changes both Form Request rules.

---

Codex: Implement this approved plan using the repository's AGENTS.md instructions. Preserve existing unrelated changes. If the plan conflicts with the code or creates a security issue, ask before changing the design. Report implementation details and verification results.
