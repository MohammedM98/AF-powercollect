<?php

namespace App\Models;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'username', 'password', 'role', 'branch_id', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

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

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class);
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

    /**
     * Super Admins implicitly hold every permission; everyone else needs an
     * explicit grant recorded in the permission_user pivot.
     */
    public function hasPermission(PermissionKey $key): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return $this->relationLoaded('permissions')
            ? $this->permissions->contains('key', $key->value)
            : $this->permissions()->where('key', $key->value)->exists();
    }
}
