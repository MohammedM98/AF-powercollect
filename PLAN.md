# PLAN: Circuit Breaker (Ampere Rating) Reference Table

## 1. Feature goal and scope

Today, a subscriber's `ampere_count` and `minimum_charge` are two independent,
free-typed fields (see `resources/js/Pages/Subscribers/SubscriberForm.jsx`
and `database/migrations/2026_09_19_090003_add_extended_fields_to_subscribers_table.php`) —
nothing enforces that every 4A subscriber pays the same minimum. This plan
introduces an admin-managed reference table of ampere ratings, each with its
own minimum payment (e.g. 4A → 20 ₪), and changes subscriber registration to
**pick** a rating instead of typing a raw ampere number.

This follows the exact same pattern already used for `Tariff` (a small,
permission-gated, non-branch-scoped lookup table with its own Index/Modal
CRUD page) — confirmed by reading `TariffController`, `TariffPolicy`,
`StoreTariffRequest`, `TariffForm.jsx`, and the `tariffs` migration. Nothing
here is a new architectural pattern.

**Decisions already made (with you) that Codex should not re-litigate:**
- Picking a rating **snapshots** its minimum payment onto the subscriber's
  existing `minimum_charge` column at the moment of selection. It is not a
  live join — editing a rating later does not retroactively change any
  already-registered subscriber's `minimum_charge`. This matches how
  `Tariff` already relates to a subscriber's own `unit_price`/`minimum_charge`
  today (linked by `tariff_id`, but the actual numbers are independent,
  typed values).
- The free-typed `ampere_count` field is fully replaced, not kept as a
  fallback. If a rating isn't in the list yet, the admin adds it to the
  Circuit Breakers page first, the same way they'd add a missing `Tariff`
  category or `Area` today.

## 2. Database changes, relationships, and constraints

**New migration: `2026_09_21_120000_create_circuit_breakers_table.php`**
```php
Schema::create('circuit_breakers', function (Blueprint $table) {
    $table->id();
    $table->unsignedSmallInteger('ampere')->unique();
    $table->decimal('minimum_payment', 10, 2);
    $table->timestamps();
});
```

**New migration: `2026_09_21_120001_replace_ampere_count_with_circuit_breaker_id_on_subscribers_table.php`**
```php
Schema::table('subscribers', function (Blueprint $table) {
    $table->dropColumn('ampere_count');
    $table->foreignId('circuit_breaker_id')->nullable()->after('billing_type')->constrained()->nullOnDelete();
});
```
- `nullable`, matching `ampere_count`'s current nullability — a subscriber
  isn't forced to have a rating assigned (same relaxed rule `ampere_count`
  has today). This is an assumption carried over from existing behavior; say
  so if you actually want it required going forward.
- `nullOnDelete`, matching the `meter_box_id` pattern — deleting a rating
  (not currently possible from the UI: like `Tariff`, `delete()` is `false`
  in the policy, see §4) unlinks rather than cascades, as defensive default.
- No data migration/backfill for existing `ampere_count` values — this is
  pre-production data, same reasoning as the national ID plan.

No other schema changes. `minimum_charge` (already on `subscribers`) is the
snapshot target — no new column needed for it.

## 3. Backend changes: routes, controllers, validation, business rules

**New files, mirroring `Tariff` exactly:**

- `app/Models/CircuitBreaker.php` — `#[Fillable(['ampere', 'minimum_payment'])]`,
  `hasMany(Subscriber::class)`.
- `app/Policies/CircuitBreakerPolicy.php` — identical shape to
  `TariffPolicy`: `viewAny`/`view` check
  `View|Create|UpdateCircuitBreakers`; `create` checks `CreateCircuitBreakers`;
  `update` checks `UpdateCircuitBreakers`; `delete`/`restore`/`forceDelete`
  all `false`. No branch scoping (global reference data, same as Tariff).
- `app/Http/Requests/StoreCircuitBreakerRequest.php` —
  `authorize()` → `$this->user()->can('create', CircuitBreaker::class)`;
  rules: `'ampere' => ['required', 'integer', 'min:1', Rule::unique('circuit_breakers', 'ampere')]`,
  `'minimum_payment' => ['required', 'numeric', 'min:0']`.
- `app/Http/Requests/UpdateCircuitBreakerRequest.php` — same rules, unique
  rule gets `->ignore($this->route('circuit_breaker')->id)`.
- `app/Http/Controllers/CircuitBreakerController.php` — copy
  `TariffController`'s shape exactly: `index`/`create`/`store`/`edit`/`update`,
  `private const SORTABLE = ['ampere', 'minimum_payment']`, an
  `editableFields()` helper returning `id`/`ampere`/`minimum_payment`, no
  branch scoping, no `formOptions()` needed (no foreign selects on this
  form).
- `database/factories/CircuitBreakerFactory.php` —
  `'ampere' => fake()->unique()->randomElement([2, 4, 6, 10, 16, 20, 25, 32, 40, 63])`,
  `'minimum_payment' => fake()->randomFloat(2, 5, 100)`.

**`app/Enums/PermissionKey.php`**
- Add three cases: `ViewCircuitBreakers = 'circuit_breakers.view'`,
  `CreateCircuitBreakers = 'circuit_breakers.create'`,
  `UpdateCircuitBreakers = 'circuit_breakers.update'`.
- Add their `label()` entries: `'View Circuit Breakers'`, `'Add Circuit
  Breakers'`, `'Edit Circuit Breakers'`.
- Add a `resourceGroups()` entry:
  `'circuit_breakers' => ['label' => 'Circuit Breakers', 'actions' => ['view' => self::ViewCircuitBreakers, 'create' => self::CreateCircuitBreakers, 'update' => self::UpdateCircuitBreakers]]`.
- No seeder change needed — `PermissionSeeder` already loops
  `PermissionKey::cases()` generically and will pick these up.

**`routes/web.php`**
- Add `Route::resource('circuit-breakers', CircuitBreakerController::class)->only(['index', 'create', 'store', 'edit', 'update']);`
  inside the existing `auth` middleware group, next to the `tariffs` line.

**Subscriber-side wiring:**

- `app/Models/Subscriber.php`: replace `'ampere_count'` with
  `'circuit_breaker_id'` in the `#[Fillable([...])]` list; add a
  `circuitBreaker(): BelongsTo` relation (`belongsTo(CircuitBreaker::class)`).
- `app/Http/Requests/StoreSubscriberRequest.php` and
  `UpdateSubscriberRequest.php`: replace
  `'ampere_count' => ['nullable', 'integer', 'min:0']` with
  `'circuit_breaker_id' => ['nullable', Rule::exists('circuit_breakers', 'id')]`.
- `app/Http/Controllers/SubscriberController.php`:
  - `editableFields()`: replace `'ampere_count' => $subscriber->ampere_count,`
    with `'circuit_breaker_id' => $subscriber->circuit_breaker_id,`.
  - `formOptions()`: add
    `'circuitBreakers' => CircuitBreaker::orderBy('ampere')->get(),`
    to the returned array (alongside the existing `tariffs`/`meterBoxes`).
- `database/factories/SubscriberFactory.php`: replace
  `'ampere_count' => fake()->randomElement([5, 10, 16, 20]),` with
  `'circuit_breaker_id' => CircuitBreaker::factory(),`.

**Business rules**
- Ampere rating values are unique (no two rows for "4A") and positive
  integers; minimum payment is a non-negative decimal.
- A subscriber's `circuit_breaker_id` stays optional (§2), but when set, it
  must reference an existing rating.
- This lookup is not branch-scoped — one shared list of ratings for the
  whole system, same as `Tariff`/`Area`/`Governorate`.

## 4. Roles, permissions, and branch-level access restrictions

Identical shape to `Tariff`: gated purely by the three new `PermissionKey`
cases, no branch check anywhere in `CircuitBreakerPolicy`. Whoever already
holds `tariffs.*` permissions is not automatically granted
`circuit_breakers.*` — these are separate grants, assigned per user/role from
Settings → Permissions exactly like every other resource group (no code
change needed there; the matrix renders from `PermissionKey::resourceGroups()`
generically).

Editing a subscriber's `circuit_breaker_id` continues to be gated by the
*existing* `SubscriberPolicy`/`PermissionKey::UpdateSubscribers` — no new
permission is needed on the subscriber side, since this is a field on an
already-permissioned resource.

## 5. Frontend changes, following existing UI conventions

**New files, mirroring the `Tariffs/` page set exactly** (`Index.jsx`,
`Create.jsx`, `Edit.jsx`, a shared `CircuitBreakerForm.jsx`, and
`CircuitBreakerModal.jsx` for the modal-based create/edit, per the
DataTable + Modal convention already used everywhere):

- `resources/js/Pages/CircuitBreakers/Index.jsx` — page title "القواطع",
  create button "قاطع جديد", table columns "الأمبير" (sortable) and "الحد
  الأدنى للدفع (₪)" (sortable, formatted via the existing
  `resources/js/lib/currency.js` `formatCurrency` helper, same as
  `Tariffs/Index.jsx` does for `rate`), a "..." row-actions menu with
  "تعديل". No search box (`showSearch={false}` on `DataTableToolbar`, same
  as Tariffs — it's a short reference list, not something you search).
- `resources/js/Pages/CircuitBreakers/CircuitBreakerForm.jsx` — two fields:
  "الأمبير" (`type="number"`, integer) and "الحد الأدنى للدفع (₪)"
  (`type="number"`, `step="0.01"`).
- `resources/js/Pages/CircuitBreakers/CircuitBreakerModal.jsx`,
  `Create.jsx`, `Edit.jsx` — copy the `Tariffs/` equivalents' structure
  exactly, renaming `tariff`/`category`/`rate` references to
  `circuitBreaker`/`ampere`/`minimum_payment`.

**Navigation and shared props:**

- `app/Http/Middleware/HandleInertiaRequests.php`: add
  `'viewCircuitBreakers' => $user->can('viewAny', CircuitBreaker::class),`
  to the `can` array.
- `resources/js/Layouts/AuthenticatedLayout.jsx`: add a new `{can?.viewCircuitBreakers && (...)}`
  `NavLink` block, positioned directly after the Tariffs link (it's the same
  kind of billing-reference data), labeled "القواطع", pointing to
  `/circuit-breakers`, with a bolt/lightning-style icon (any simple
  `stroke="currentColor"` outline icon consistent with the existing set is
  fine — this is a cosmetic choice, not a design decision Codex needs to
  ask about).

**Subscriber form changes:**

- `resources/js/Pages/Subscribers/SubscriberForm.jsx`: replace the
  `ampere_count` numeric `Field` with a `circuit_breaker_id` select,
  populated from a new `circuitBreakers` prop, each `<option>` labeled like
  `"4A — 20.00 ₪"` (ampere + its minimum payment, so the admin can see what
  they're picking without leaving the form). On `onChange`, in addition to
  `setData('circuit_breaker_id', value)`, also look up the selected rating
  in the `circuitBreakers` prop and call
  `setData('minimum_charge', match.minimum_payment)` — this is the
  "snapshot" behavor from §1: picking a rating pre-fills the minimum charge,
  which the admin can still edit afterward like any other field. Leave the
  field's visibility unconditional (shown regardless of `billing_type`),
  matching `ampere_count`'s current unconditional visibility — not
  introducing new conditional-field logic that wasn't asked for.
- `resources/js/Pages/Subscribers/Create.jsx`: add `circuit_breaker_id: ''`
  to the `useForm` defaults (replacing `ampere_count: ''`), and pass a new
  `circuitBreakers` prop through to `SubscriberForm`.
- `resources/js/Pages/Subscribers/Edit.jsx`: same, initial value
  `subscriber.circuit_breaker_id ?? ''`, and accept/pass the `circuitBreakers`
  prop.
- `resources/js/Pages/Subscribers/SubscriberModal.jsx`: same change to both
  the `BLANK` constant and the `isEdit` branch, and accept/pass
  `circuitBreakers`.
- `resources/js/Pages/Subscribers/Index.jsx`: pass the `circuitBreakers`
  prop it already receives from the controller through to both
  `SubscriberModal` instances (create and edit).

No new npm/composer dependencies; no new components beyond the
`CircuitBreakers/` page set (which mirrors existing ones).

## 6. Files to create or modify, ordered implementation steps

1. Create `database/migrations/2026_09_21_120000_create_circuit_breakers_table.php`.
2. Create `database/migrations/2026_09_21_120001_replace_ampere_count_with_circuit_breaker_id_on_subscribers_table.php`.
3. Run `php artisan migrate` to confirm both apply cleanly.
4. Create `app/Models/CircuitBreaker.php`.
5. Create `app/Policies/CircuitBreakerPolicy.php` and register it if the app
   uses explicit policy registration (check `AuthServiceProvider` /
   `bootstrap/app.php` for how `TariffPolicy` is registered and mirror it —
   Laravel's convention-based auto-discovery may already cover this with no
   registration needed; verify against how `Tariff` → `TariffPolicy` is
   wired before assuming either way).
6. Create `app/Http/Requests/StoreCircuitBreakerRequest.php` and
   `UpdateCircuitBreakerRequest.php`.
7. Create `app/Http/Controllers/CircuitBreakerController.php`.
8. Create `database/factories/CircuitBreakerFactory.php`.
9. Update `app/Enums/PermissionKey.php` (three new cases + labels +
   `resourceGroups()` entry).
10. Update `routes/web.php` (new resource route).
11. Update `app/Http/Middleware/HandleInertiaRequests.php` (`can.viewCircuitBreakers`).
12. Update `resources/js/Layouts/AuthenticatedLayout.jsx` (new nav link).
13. Create the four `resources/js/Pages/CircuitBreakers/*.jsx` files.
14. Update `app/Models/Subscriber.php` (Fillable + relation).
15. Update `app/Http/Requests/StoreSubscriberRequest.php` and
    `UpdateSubscriberRequest.php` (swap `ampere_count` rule for
    `circuit_breaker_id`).
16. Update `app/Http/Controllers/SubscriberController.php`
    (`editableFields()` + `formOptions()`).
17. Update `database/factories/SubscriberFactory.php`.
18. Update `resources/js/Pages/Subscribers/{SubscriberForm,Create,Edit,SubscriberModal,Index}.jsx`.
19. Add new test file `tests/Feature/CircuitBreakers/CircuitBreakerAuthorizationTest.php`
    (§7).
20. Update `tests/Feature/Subscribers/*` only if any existing test asserts
    on `ampere_count` directly (grep for it first — none appear to as of
    this plan, since it's optional and existing tests don't set it).
21. Run `php artisan test` and `npm run build` to verify.

## 7. Acceptance criteria and required tests

**Acceptance criteria**
- A permitted user can view, create, and edit circuit breaker ratings from
  a new "القواطع" page, via modal, matching the Tariffs page's look and
  interaction exactly.
- Creating two ratings with the same `ampere` value is rejected.
- On the subscriber form, `ampere_count`'s free-number input is gone,
  replaced by a dropdown of existing ratings; selecting one fills
  `minimum_charge` with that rating's `minimum_payment`, and the admin can
  still edit `minimum_charge` afterward.
- Editing a circuit breaker's `minimum_payment` later does **not** change
  any already-registered subscriber's `minimum_charge`.
- A user without `circuit_breakers.*` permissions cannot reach
  `/circuit-breakers` (403), and does not see the nav link.
- `php artisan test` passes in full; `npm run build` succeeds.

**New test file: `tests/Feature/CircuitBreakers/CircuitBreakerAuthorizationTest.php`**
(mirror `tests/Feature/Tariffs/TariffAuthorizationTest.php`'s structure and
naming convention exactly, swapping in circuit-breaker specifics):
- `test_super_admin_can_view_circuit_breaker_index`
- `test_super_admin_can_create_a_circuit_breaker`
- `test_super_admin_can_update_a_circuit_breaker`
- `test_cannot_create_two_circuit_breakers_with_the_same_ampere`
- `test_branch_admin_cannot_view_circuit_breaker_index`
- `test_branch_admin_cannot_create_a_circuit_breaker`
- `test_collector_cannot_view_circuit_breakers`
- `test_guest_is_redirected_to_login`

**New test in `tests/Feature/Subscribers/` (add to
`SubscriberAuthorizationTest.php` or a new file, Codex's call):**
- `test_registering_a_subscriber_with_a_circuit_breaker_snapshots_its_minimum_payment`:
  create a `CircuitBreaker` with a known `minimum_payment`, POST a new
  subscriber referencing it via `circuit_breaker_id`, then separately
  update that circuit breaker's `minimum_payment` to a different value, and
  assert the subscriber's own `minimum_charge` in the database is
  unchanged (proves the snapshot, not live-join, behavior from §1).

## 8. Anything explicitly out of scope

- No changes to `billing_type`, `unit_price`, or the Meter-based billing
  path — this only touches the Ampere-side minimum-payment data.
- No conditional show/hide of the circuit breaker field based on
  `billing_type` (see §5) — flagged as a possible future refinement, not
  built here.
- No backfill/migration of existing subscribers' `ampere_count` values into
  matching `CircuitBreaker` rows — dev-stage data, dropped along with the
  column (§2).
- No delete UI for circuit breaker ratings (matches `Tariff`'s existing
  `delete() => false` policy and un-registered destroy route).
- No changes to the still-unimplemented national ID / initial reading plan
  from the previous `PLAN.md` — that work is parked, not part of this
  feature, and will be handed to Codex separately.
- No new Composer or npm packages.

---

Codex: Implement this approved plan using the repository's AGENTS.md instructions. Preserve existing unrelated changes. If the plan conflicts with the code or creates a security issue, ask before changing the design. Report implementation details and verification results.
