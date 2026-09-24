<?php

namespace App\Policies;

use App\Models\User;

class ReadingEntrySettingPolicy
{
    /**
     * The reading entry schedule is company-wide, so only the Super Admin
     * manages it.
     */
    public function manage(User $user): bool
    {
        return $user->isSuperAdmin();
    }
}
