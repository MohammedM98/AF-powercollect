<?php

namespace App\Models;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Concerns\BelongsToBranch;
use App\Support\DeletionBlocker;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

#[Fillable(['name', 'username', 'password', 'role', 'branch_id', 'is_active', 'user_type_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToBranch, HasFactory, Notifiable;

    /** Why the last active Super Admin cannot be deactivated, demoted or deleted. */
    public const LAST_SUPER_ADMIN_MESSAGE = 'لا يمكن إيقاف آخر مدير نظام فعّال أو تغيير دوره أو حذفه؛ أضف مدير نظام آخر أولًا.';

    /**
     * A new user starts with their role's usual permissions ticked, and
     * changing someone's role swaps their ticks for the new role's.
     */
    protected static function booted(): void
    {
        static::created(fn (User $user) => $user->resetToRoleStarterPermissions());

        static::updated(function (User $user): void {
            if ($user->wasChanged('role')) {
                $user->resetToRoleStarterPermissions();
            }
        });

        // However it is reached, the company must keep one active Super Admin, or nobody can get back in to fix anything.
        static::updating(function (User $user): void {
            $losesTheRole = $user->isDirty('role') && $user->role !== UserRole::SuperAdmin;
            $losesAccess = $user->isDirty('is_active') && ! $user->is_active;

            if (($losesTheRole || $losesAccess) && $user->isOnlyActiveSuperAdmin()) {
                throw ValidationException::withMessages(['is_active' => self::LAST_SUPER_ADMIN_MESSAGE]);
            }
        });

        static::deleting(function (User $user): void {
            if ($user->isOnlyActiveSuperAdmin()) {
                throw ValidationException::withMessages(['delete' => self::LAST_SUPER_ADMIN_MESSAGE]);
            }
        });
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => UserRole::class,
            'is_active' => 'boolean',
        ];
    }

    public function userType(): BelongsTo
    {
        return $this->belongsTo(UserType::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class);
    }

    /**
     * Replace this user's ticked permissions with their role's starter set
     * (see UserRole::starterPermissions()).
     */
    public function resetToRoleStarterPermissions(): void
    {
        // Company-wide starters only come with a Super Admin's (or the system's) say-so.
        $actor = auth()->user();
        $starters = array_filter(
            $this->role->starterPermissions(),
            fn (PermissionKey $key): bool => ! $key->isCompanyWide() || $actor === null || $actor->isSuperAdmin(),
        );

        $this->permissions()->sync(Permission::idsFor($starters));
        $this->unsetRelation('permissions');
    }

    public function registeredSubscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class, 'registered_by');
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === UserRole::SuperAdmin;
    }

    /**
     * Whether, as stored, this is the only Super Admin who is active: the
     * one account the company cannot lose.
     */
    public function isOnlyActiveSuperAdmin(): bool
    {
        return $this->getOriginal('role') === UserRole::SuperAdmin
            && (bool) $this->getOriginal('is_active')
            && ! self::query()
                ->where('role', UserRole::SuperAdmin->value)
                ->where('is_active', true)
                ->whereKeyNot($this->getKey())
                ->exists();
    }

    public function isBranchAdmin(): bool
    {
        return $this->role === UserRole::BranchAdmin;
    }

    public function isCollector(): bool
    {
        return $this->role === UserRole::Collector;
    }

    public function isDataEntry(): bool
    {
        return $this->role === UserRole::DataEntry;
    }

    public function isFinancialAuditor(): bool
    {
        return $this->role === UserRole::FinancialAuditor;
    }

    /**
     * The area (منطقة) the user's branch sits in — the only area where
     * anyone but a Super Admin may add or edit sub-areas. Null when the
     * user has no branch or the branch has no area set.
     */
    public function branchAreaId(): ?int
    {
        return $this->branch?->area_id;
    }

    /**
     * Super Admins implicitly hold every permission; everyone else needs an
     * explicit grant recorded in the permission_user pivot. The grants are
     * read once and reused, since one page checks many permissions.
     */
    public function hasPermission(PermissionKey $key): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return $this->loadMissing('permissions')->permissions->contains('key', $key->value);
    }

    /**
     * Whether the user holds at least one of the given permissions.
     */
    public function hasAnyPermission(PermissionKey ...$keys): bool
    {
        foreach ($keys as $key) {
            if ($this->hasPermission($key)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Why the user can't be deleted yet — everything that carries their
     * name, so that who did what is never lost or erased — or null when
     * they can: an account added by mistake. Stopping the account is the
     * way to retire someone who has worked.
     */
    public function deletionBlocker(): ?string
    {
        $named = fn (string $model, string ...$columns): int => $model::query()
            ->where(function ($query) use ($columns): void {
                foreach ($columns as $column) {
                    $query->orWhere($column, $this->id);
                }
            })
            ->count();

        return DeletionBlocker::describe('المستخدم', [
            'المشتركون المسجّلون' => $this->registeredSubscriptions()->count(),
            'الحركات المالية' => $named(SubscriptionTransaction::class, 'recorded_by', 'employee_id', 'cancelled_by'),
            'تعديلات الدفعات' => $named(TransactionAmendment::class, 'user_id'),
            'الحذف النهائي' => $named(TransactionDeletion::class, 'user_id'),
            'سجل تعديل البيانات الشخصية' => $named(SubscriberProfileChange::class, 'user_id'),
            'القراءات' => $named(MeterReading::class, 'recorded_by', 'approved_by'),
            'خصومات القراءات الأسبوعية' => $named(StandingDiscount::class, 'granted_by'),
            'كشوف الإغلاق' => $named(Closing::class, 'prepared_by', 'reviewed_by'),
            'سجل كشوف الإغلاق' => $named(ClosingEvent::class, 'user_id') + $named(ClosingPayment::class, 'matched_by'),
            'تسليمات النقد' => $named(CashTransfer::class, 'sent_by', 'recipient_id', 'received_by'),
            'التعديلات الجماعية' => $named(SubscriptionBulkChange::class, 'user_id', 'undone_by'),
            'تغييرات الأسعار' => $named(TariffRateChange::class, 'changed_by'),
            'الرسائل' => $named(MessageBatch::class, 'created_by') + $named(SubscriptionMessage::class, 'sent_by'),
        ], 'يمكنك إيقاف حسابه بدلًا من حذفه.');
    }

    /**
     * Delete the account, its permissions, notifications and sessions (so
     * it is signed out); deletionBlocker() must allow it first.
     */
    public function deleteAccount(): void
    {
        DB::transaction(function (): void {
            $this->notifications()->delete();
            DB::table('sessions')->where('user_id', $this->id)->delete();
            $this->delete();
        });
    }
}
