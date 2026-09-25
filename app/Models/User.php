<?php

namespace App\Models;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Concerns\BelongsToBranch;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'username', 'password', 'role', 'branch_id', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToBranch, HasFactory, Notifiable;

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

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class);
    }

    public function registeredSubscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class, 'registered_by');
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
}
