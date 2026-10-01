<?php

namespace App\Policies;

use App\Models\User;

class ClosingSettingPolicy
{
    /**
     * The closing schedule is company-wide, so only the Super Admin
     * manages it and opens a day's closings by hand.
     */
    public function manage(User $user): bool
    {
        return $user->isSuperAdmin();
    }
}
