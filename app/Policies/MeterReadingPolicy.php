<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\MeterReading;
use App\Models\User;

class MeterReadingPolicy
{
    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $this->canRecord($user) || $user->hasPermission(PermissionKey::ViewMeterReadings);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, MeterReading $meterReading): bool
    {
        return $this->viewAny($user) && ($user->isSuperAdmin() || $meterReading->branch_id === $user->branch_id);
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $this->canRecord($user);
    }

    /**
     * A reading stays editable only until it has been approved, and only
     * within the actor's own branch.
     */
    public function update(User $user, MeterReading $meterReading): bool
    {
        if (! $this->canRecord($user) || ! $meterReading->isPending()) {
            return false;
        }

        return $user->isSuperAdmin() || $meterReading->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, MeterReading $meterReading): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, MeterReading $meterReading): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, MeterReading $meterReading): bool
    {
        return false;
    }

    /**
     * Data entry staff record readings by default; other roles need the
     * dedicated permission.
     */
    private function canRecord(User $user): bool
    {
        return $user->isSuperAdmin()
            || $user->isBranchAdmin()
            || $user->isDataEntry()
            || $user->hasPermission(PermissionKey::RecordMeterReadings);
    }
}
