# PLAN: Free-Form Tariff Type Management (replace the fixed Home/Business list)

**Status: DRAFT — not yet approved.** The user asked for this plan to be written
up first, reviewed, and extended with more requirements before anything is
implemented or committed. Do not implement until the user explicitly approves.

## 1. Feature goal and scope

Today `Tariff` is hard-limited to exactly two categories via the
`App\Enums\TariffCategory` enum: `Home` (منزلي) and `Business` (تجاري). The
`TariffSeeder`'s own comment already anticipates this: *"Rates are
placeholders — update them from Settings once a rate-management screen
exists."* The Tariffs resource (model, migration, policy, requests,
controller, and a full Inertia/React CRUD UI — index with search/sort/
pagination, a create/edit modal, dedicated Create/Edit pages, and dead-but-
consistent Blade fallbacks) already exists and is fully built — confirmed by
reading every file listed in §6. It just enforces the wrong constraint.

This plan converts that fixed 2-value enum into a **free-form, admin-managed
list of tariff types**: any user with the right permission can add, rename,
or reprice as many tariff types as they want, each with its own price per
kilowatt. No new table is needed — a `Tariff` row already *is* one type +
one rate; this plan removes the enum ceiling on how many can exist and what
they're called.

Concretely: rename the `tariffs.category` column (enum-constrained) to
`tariffs.name` (free-text, unique, admin-typed), delete `TariffCategory`
entirely, and update every layer that touches it.

**This is a first draft for your review — see the open questions in §8
before anything gets implemented.**

## 2. Database changes, relationships, and constraints

One migration (today's date convention, sorts after every existing
migration under `database/migrations/`):

**`2026_09_22_HHMMSS_rename_category_to_name_on_tariffs_table.php`**
```php
public function up(): void
{
    Schema::table('tariffs', function (Blueprint $table) {
        $table->renameColumn('category', 'name');
    });

    // The two existing seeded rows hold raw enum slugs ('home' / 'business')
    // as their category value today. After the rename those would surface
    // as literal English slugs instead of a real label — fix the data in
    // the same migration so nothing regresses.
    DB::table('tariffs')->where('name', 'home')->update(['name' => 'سكني']);
    DB::table('tariffs')->where('name', 'business')->update(['name' => 'تجاري']);
}

public function down(): void
{
    DB::table('tariffs')->where('name', 'سكني')->update(['name' => 'home']);
    DB::table('tariffs')->where('name', 'تجاري')->update(['name' => 'business']);

    Schema::table('tariffs', function (Blueprint $table) {
        $table->renameColumn('name', 'category');
    });
}
```
- Laravel 13's schema builder renames columns natively (MySQL/Postgres/
  SQLite) without `doctrine/dbal` — confirmed working via the same approach
  in the existing (still-unimplemented) `PLAN.md` in this repo. Do not add
  that package.
- `name` stays a plain `string` column with its existing `unique()` index —
  the uniqueness constraint carries over unchanged, just now enforced
  against arbitrary admin-typed text instead of two enum values.
- No FK/relationship changes — `subscribers.tariff_id` keeps pointing at the
  same rows; renaming the column doesn't touch any `id`.
- No changes to `rate` (`decimal(10,2)`) — see §8 for the one naming nuance
  worth flagging there.

## 3. Backend changes: routes, controllers, validation, business rules

No route changes — `Route::resource('tariffs', ...)` already covers
index/create/store/edit/update; `TariffPolicy` (`viewAny`/`create`/`update`
gated by `ViewTariffs`/`CreateTariffs`/`UpdateTariffs`, `delete` always
`false`) is untouched.

**Delete `app/Enums/TariffCategory.php` entirely** — nothing needs it once
every reference below is updated.

**`app/Models/Tariff.php`**
- `#[Fillable(['category', 'rate'])]` → `#[Fillable(['name', 'rate'])]`.
- `casts()`: drop `'category' => TariffCategory::class`; keep
  `'rate' => 'decimal:2'`.
- Remove the `use App\Enums\TariffCategory;` import.

**`app/Http/Requests/StoreTariffRequest.php`**
- Replace the `category` rule with:
  `'name' => ['required', 'string', 'max:255', Rule::unique('tariffs', 'name')]`.
- `rate` rule unchanged: `['required', 'numeric', 'min:0']`.
- Remove the `TariffCategory` import and the `Rule::in(...)` call.

**`app/Http/Requests/UpdateTariffRequest.php`**
- Same `name` rule, `->ignore($this->route('tariff'))` on the unique check
  (same pattern already used everywhere else in this codebase).

**`app/Http/Controllers/TariffController.php`**
- `SORTABLE`: `['category', 'rate']` → `['name', 'rate']`.
- `index()`: 
  - `applyDataTableFilters($query, $request, [], self::SORTABLE, 'category')`
    → `applyDataTableFilters($query, $request, ['name'], self::SORTABLE, 'name')`
    — search becomes meaningful now that names are free text (today it's
    `[]`, i.e. no search at all, because a 2-value enum never needed one).
  - Remove `applyDataTableFilterSelects($query, $request, ['category'])` and
    the `filterOptions` key from the Inertia payload entirely — a dropdown
    filter doesn't make sense against an open-ended, admin-typed list the
    way it does for a small fixed set like Branch status or User role (see
    §8 if you want something here instead, e.g. filtering by rate range).
  - `'categoryLabel' => __($tariff->category->label())` in the `->through()`
    map → drop it; `editableFields()` already exposes the raw field.
- `create()`/`edit()`: drop `'categoryOptions' => $this->categoryOptions()`
  from both — nothing consumes it once the form is a plain text input.
- `editableFields()`: `'category' => $tariff->category->value` →
  `'name' => $tariff->name`.
- Delete the private `categoryOptions()` method entirely.

**`app/Http/Controllers/SubscriberController.php`** (Tariff is referenced
here too, for the subscriber registration form's tariff picker and the
subscriber list's tariff column)
- `index()`'s `->through()` map:
  `'tariffCategoryLabel' => __($subscriber->tariff->category->label())` →
  `'tariffName' => $subscriber->tariff->name`.
- `formOptions()`'s `$tariffs` mapping:
  `'categoryLabel' => __($tariff->category->label())` → `'name' => $tariff->name`;
  `Tariff::orderBy('category')` → `Tariff::orderBy('name')`.

**Business rules**
- A tariff type's name must be non-empty, at most 255 characters, and unique
  across all tariff types (case-sensitive uniqueness, matching how every
  other `Rule::unique` in this codebase behaves — flag in §8 if you want
  case-insensitive).
- Rate must be a non-negative number, same as today — no new constraint.
- Nothing about who *creates* a tariff type changes: it's already gated by
  `CreateTariffs`/`UpdateTariffs`, which Super Admin holds implicitly and
  anyone else needs granted via Settings → Permissions (§4).

**`database/factories/TariffFactory.php`**
- `'category' => fake()->randomElement(TariffCategory::cases())` →
  `'name' => fake()->unique()->words(2, true)` (or similar free-text
  generator — exact wording open to your preference).
- `home()`/`business()` named states: keep them as convenience states for
  existing tests, just producing a specific `name` string now instead of an
  enum case (e.g. `fn () => ['name' => 'سكني']` / `['name' => 'تجاري']`) —
  proposed default to minimize test churn; drop them instead if you'd rather
  tests stop referencing "home"/"business" as concepts at all (flagged §8).

**`database/seeders/TariffSeeder.php`**
- `Tariff::updateOrCreate(['category' => TariffCategory::Home->value], ...)`
  → `Tariff::updateOrCreate(['name' => 'سكني'], ['rate' => 50])`, same for
  `'تجاري'` / `120`. Update the class doc-comment too, since "seed the two
  fixed tariff categories" is no longer accurate — they're just starter
  rows an admin can freely rename, delete... actually can't delete (see
  §8), reprice, or add more alongside.

## 4. Roles, permissions, and branch-level access restrictions

No changes. `PermissionKey::{ViewTariffs,CreateTariffs,UpdateTariffs}` and
`TariffPolicy` already gate this exactly as "full management for the admin"
requires: Super Admin has every permission implicitly; anyone else needs
`CreateTariffs`/`UpdateTariffs` granted via Settings → Permissions (built in
an earlier session). This feature doesn't add a new permission — it just
makes the *content* admins can manage open-ended instead of fixed to two
values.

## 5. Frontend changes, following existing UI conventions

Same four-file pattern as every other resource in this codebase (shared
form component + modal + two dedicated pages), plus the index page and the
two Subscriber-side files that display a tariff's name.

**`resources/js/Pages/Tariffs/TariffForm.jsx`**
- Replace the `<select id="category">` populated from `categoryOptions`
  with a plain `<TextInput id="name">` (free text), label "اسم نوع
  التعرفة" (or similar — wording open to you). Drop the `categoryOptions`
  prop entirely.
- Rate field: keep as-is, or relabel from `"السعر (₪)"` to something that
  makes "per kilowatt" explicit, e.g. `"سعر الكيلوواط (₪)"` — see §8's
  naming nuance before committing to that label everywhere.

**`resources/js/Pages/Tariffs/TariffModal.jsx`, `Create.jsx`, `Edit.jsx`**
- `useForm` defaults: `category: tariff.category` / `category:
  categoryOptions[0]?.value ?? ''` → `name: tariff.name` / `name: ''` (no
  more "first option" default since there's no longer a fixed list).
- Drop the `categoryOptions` prop threading in all three files.

**`resources/js/Pages/Tariffs/Index.jsx`**
- `SortableTh column="category"` → `column="name"` label "الاسم".
- `DataTableToolbar`: flip `showSearch={false}` → `showSearch` (default
  `true`) with `placeholder="بحث باسم نوع التعرفة..."`; drop the
  `filterMenu`/`DataTableFilterMenu` usage and the now-unused
  `filterOptions`/`categoryOptions` props (per the controller change in
  §3, `filterOptions` won't be sent from the backend at all anymore).
- Row rendering: `{tariff.categoryLabel}` → `{tariff.name}`.

**`resources/js/Pages/Subscribers/SubscriberForm.jsx`**
- The tariff `<select>`'s option label `{tariff.categoryLabel}` →
  `{tariff.name}` (matches the `formOptions()` key rename in §3).

**`resources/js/Pages/Subscribers/Index.jsx`**
- `{subscriber.tariffCategoryLabel}` → `{subscriber.tariffName}` (column
  header "التعرفة" stays as-is).

**Dead Blade fallbacks** (kept in sync per this repo's standing convention
— they're never actually rendered by any route, but stay internally
consistent so a future flip-to-Blade wouldn't break):
- `resources/views/tariffs/_form.blade.php`: swap the `category` select
  (populated from `$categoryOptions`) for a plain text input bound to
  `name`; update `$tariff->category->value` → `$tariff->name` and the
  error-bag key.
- `resources/views/tariffs/index.blade.php`: `{{ __($tariff->category->label()) }}`
  → `{{ $tariff->name }}`.
- `resources/views/tariffs/create.blade.php` / `edit.blade.php`: drop
  whatever passes `categoryOptions` into the partial, if anything does
  (confirm when implementing — not yet checked line-by-line here).

**`lang/ar.json`**
- `"Category": "الفئة"` and the standalone `"Home"`/`"Business"` entries
  become unused by this feature specifically — leave them in place unless a
  repo-wide sweep confirms nothing else references them (out of scope for
  this plan to audit exhaustively; flagged, not decided).

No new components, no new dependencies, no layout/style changes beyond the
field swap itself.

## 6. Files to create or modify, ordered implementation steps

1. Create migration:
   `rename_category_to_name_on_tariffs_table.php` (§2).
2. Run `php artisan migrate` locally to confirm it applies cleanly and the
   two data-fix `UPDATE`s land correctly.
3. Delete `app/Enums/TariffCategory.php`.
4. Update `app/Models/Tariff.php`.
5. Update `app/Http/Requests/StoreTariffRequest.php`.
6. Update `app/Http/Requests/UpdateTariffRequest.php`.
7. Update `app/Http/Controllers/TariffController.php`.
8. Update `app/Http/Controllers/SubscriberController.php`.
9. Update `database/factories/TariffFactory.php`.
10. Update `database/seeders/TariffSeeder.php`.
11. Update `resources/js/Pages/Tariffs/TariffForm.jsx`.
12. Update `resources/js/Pages/Tariffs/TariffModal.jsx`.
13. Update `resources/js/Pages/Tariffs/Create.jsx`.
14. Update `resources/js/Pages/Tariffs/Edit.jsx`.
15. Update `resources/js/Pages/Tariffs/Index.jsx`.
16. Update `resources/js/Pages/Subscribers/SubscriberForm.jsx`.
17. Update `resources/js/Pages/Subscribers/Index.jsx`.
18. Update `resources/views/tariffs/_form.blade.php`,
    `index.blade.php`, and check `create.blade.php`/`edit.blade.php`.
19. Update `tests/Feature/Tariffs/TariffAuthorizationTest.php` and any other
    test touching `TariffCategory`/`category` (§7).
20. Run `php artisan test` and `npm run build` to verify; live-verify the
    Tariffs list, create/edit modal, and the Subscriber registration form's
    tariff picker in the browser (per this repo's standing Playwright
    verification workflow).

## 7. Acceptance criteria and required tests

**Acceptance criteria**
- A user with `CreateTariffs` can create a tariff type with any name and a
  non-negative kilowatt price — not limited to "Home" or "Business".
- Two tariff types can't share the same name; editing a tariff type's own
  name to itself (no-op save) doesn't falsely trigger a uniqueness error.
- The Subscriber registration form's tariff picker and the Subscribers list
  both show the real, admin-chosen name instead of a translated enum label.
- Existing seeded tariffs ("سكني"/"تجاري") keep working as normal tariff
  types after the migration — no subscriber loses its tariff association.
- `php artisan test` passes in full; `npm run build` succeeds.

**Tests to update** (`tests/Feature/Tariffs/TariffAuthorizationTest.php`):
- Every `'category' => TariffCategory::Home->value` payload → `'name' =>
  '<some string>'` (e.g. `'سكني'` or a plain test string).
- `test_cannot_create_two_tariffs_with_the_same_category` → rename/rework
  to assert on `name` instead of `category`; adjust the `assertSessionHas
  Errors` field name.
- Remove the `use App\Enums\TariffCategory;` import once nothing needs it.

**Other files referencing the enum** (confirmed via repo-wide search, needs
the same treatment): `tests/Feature/SubscriberModelTest.php` — check its
`Tariff::factory()->home()`/`->business()` usage still compiles against the
renamed factory states from §3.

**New tests to add** (can go in the same `TariffAuthorizationTest.php` or a
new `TariffValidationTest.php`, your call):
- `test_tariff_name_is_required`
- `test_tariff_name_must_be_unique`
- `test_tariff_name_uniqueness_ignores_the_current_tariff_on_update`
- `test_admin_can_create_an_arbitrary_tariff_type_beyond_home_or_business`
  (the actual point of this feature — assert a tariff named something like
  `'صناعي'` (Industrial) can be created and is not rejected)

## 8. Open questions — please answer or add to before this is implemented

These are flagged rather than silently decided, per your instruction to
review before anything is committed:

1. **Does selecting a tariff type on the Subscriber form pull in its
   kilowatt price?** Today `Subscriber.unit_price` is a fully independent,
   manually-typed field — picking a tariff on the registration form does
   *not* auto-fill or lock it to that tariff's `rate`. If "the kilowatt
   price for every type" is meant to actually drive subscriber billing
   (auto-fill `unit_price` from the chosen tariff, possibly making it
   read-only / re-syncing when the tariff's rate later changes), that's a
   materially bigger change than this plan currently covers — tell me and
   I'll fold it in before implementation.
2. **`rate` also covers Ampere-based billing.** `Subscriber.billing_type`
   can be `Meter` or `Ampere` (`App\Enums\BillingType`), and a tariff's
   `rate` is used as a single number regardless of which. If you want the
   label to say "سعر الكيلوواط" everywhere, that's slightly inaccurate for
   an Ampere-billed subscriber's tariff. Fine to leave the label generic
   ("السعر (₪)") instead, or split into two labeled rates per billing type
   — tell me which.
3. **Should a tariff type be deletable once it's no longer used?**
   `TariffPolicy::delete()` is hard-coded `false` today (matching every
   other resource in this app — nothing is ever deletable, only
   deactivated/edited). This plan doesn't change that. If "full management"
   should include actually removing a tariff type (when zero subscribers
   reference it, presumably), that's new policy + controller work — tell me
   if you want it.
4. **Any starter/seed types beyond the two renamed ones?** Right now §2
   just renames the existing "home"/"business" rows to "سكني"/"تجاري" so
   existing subscriber associations keep displaying sensibly. If you want
   additional starter types seeded (e.g. "صناعي" / Industrial, "حكومي" /
   Government), tell me the names and rates and I'll add them to §2/§3.
5. **Exact field labels.** I used placeholder Arabic labels above ("اسم نوع
   التعرفة", "سعر الكيلوواط (₪)") — tell me if you want different wording.

## 9. Explicitly out of scope (unless you fold it in above)

- No auto-sync between a tariff type's rate and a subscriber's `unit_price`
  (see §8.1).
- No tariff-type deletion (see §8.3).
- No historical/versioned pricing — editing a tariff type's rate changes it
  going forward only; no record is kept of what the rate was when an
  existing subscriber was registered under it.
- No bulk/CSV import of tariff types.
- No new permission — existing `CreateTariffs`/`UpdateTariffs` already
  cover this (§4).
- Does not touch the other still-unimplemented `PLAN.md` in this repo
  (subscriber national ID + initial reading) — unrelated feature, separate
  plan, separate file.

---

This is a draft for discussion — nothing here has been implemented, and no
files outside this plan document have been touched. Add anything you want
changed, answer the open questions in §8, and say when you're ready for it
to be implemented and committed.
