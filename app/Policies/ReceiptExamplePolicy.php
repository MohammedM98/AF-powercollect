<?php

namespace App\Policies;

use App\Models\User;

class ReceiptExamplePolicy
{
    public function manage(User $user): bool
    {
        return $user->isSuperAdmin();
    }
}
