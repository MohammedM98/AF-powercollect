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

#[Fillable(['name', 'username', 'password', 'role', 'branch_id', 'is_active', 'user_type_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToBranch, HasFactory, Notifiable;

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
     * Why the user can't be deleted yet — the work recorded in their name —
     * or null when they can: an account added by mistake.
     */
    public function deletionBlocker(): ?string
    {
        return DeletionBlocker::describe('المستخدم', [
            'المشتركون المسجّلون' => $this->registeredSubscriptions()->count(),
            'الحركات المالية' => SubscriptionTransaction::query()->where('recorded_by', $this->id)->orWhere('cancelled_by', $this->id)->count(),
            'القراءات' => MeterReading::query()->where('recorded_by', $this->id)->orWhere('approved_by', $this->id)->count(),
            'خصومات القراءات الأسبوعية' => StandingDiscount::query()->where('granted_by', $this->id)->count(),
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
