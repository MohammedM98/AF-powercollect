<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\MeterReading;
use App\Models\ReadingEntrySetting;
use App\Models\User;
use Carbon\CarbonInterface;

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
     * Determine whether the user can create models — for `$weekStart`,
     * when given, which must be a week still open to them.
     */
    public function create(User $user, ?CarbonInterface $weekStart = null): bool
    {
        return $this->canRecord($user)
            && $this->entryIsOpenFor($user)
            && ($weekStart === null || $this->weekIsOpenFor($user, $weekStart));
    }

    /**
     * A reading stays editable only until it has been approved, while its
     * week is still the latest one, and only within the actor's own branch.
     */
    public function update(User $user, MeterReading $meterReading): bool
    {
        if (! $this->canRecord($user) || ! $meterReading->isPending() || ! $this->entryIsOpenFor($user)) {
            return false;
        }

        if (! $this->weekIsOpenFor($user, $meterReading->week_start)) {
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
     * The Super Admin may record readings at any time; everyone else only
     * while the company-wide reading entry window is open.
     */
    private function entryIsOpenFor(User $user): bool
    {
        return $user->isSuperAdmin() || ReadingEntrySetting::current()->isOpen();
    }

    /**
     * Only the latest week is entered or corrected; once the next week
     * starts, earlier weeks are view-only for everyone but the Super Admin.
     */
    private function weekIsOpenFor(User $user, CarbonInterface $weekStart): bool
    {
        return $user->isSuperAdmin() || MeterReading::weekStartFor($weekStart)->equalTo(MeterReading::latestEndedWeekStart());
    }

    /**
     * Recording readings needs the permission (ticked by default for
     * Branch Admins and Data Entry).
     */
    private function canRecord(User $user): bool
    {
        return $user->hasPermission(PermissionKey::RecordMeterReadings);
    }
}
