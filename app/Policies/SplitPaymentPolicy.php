<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\SplitPayment;
use App\Models\User;

class SplitPaymentPolicy
{
    /**
     * Who may open a split transfer's details: anyone who works with payments,
     * subscriptions or closings. Which of its parts they see is limited to
     * their branch's by the controller.
     */
    public function view(User $user, SplitPayment $splitPayment): bool
    {
        return $user->hasAnyPermission(
            PermissionKey::ViewCollections,
            PermissionKey::RecordCollections,
            PermissionKey::ViewSubscriptions,
            PermissionKey::ViewOwnClosings,
            PermissionKey::ViewAllClosings,
            PermissionKey::AuditClosings,
        );
    }
}
