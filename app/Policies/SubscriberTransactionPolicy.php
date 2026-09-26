<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\SubscriberTransaction;
use App\Models\User;

/**
 * Read-only access to the subscriber ledger (the financial log and the
 * branch performance pages built on it). Entries are only ever written by
 * the subscriber and meter-reading flows, never from these pages.
 */
class SubscriberTransactionPolicy
{
    /**
     * Viewing the ledger takes the "View Collections" permission.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewCollections);
    }

    /**
     * One branch's figures: any branch for the Super Admin, otherwise only
     * the user's own.
     */
    public function viewForBranch(User $user, Branch $branch): bool
    {
        return $this->viewAny($user) && ($user->isSuperAdmin() || $branch->id === $user->branch_id);
    }

    public function view(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    public function create(User $user): bool
    {
        return false;
    }

    public function update(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    public function delete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    public function restore(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    public function forceDelete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }
}
