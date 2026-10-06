<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Subscription;
use App\Models\User;

class SubscriptionPolicy
{
    /**
     * Whether the user's ticked permissions let them work with subscriptions
     * at all, before branch scoping is considered.
     */
    private function hasBaseAccess(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::ViewSubscriptions, PermissionKey::CreateSubscriptions, PermissionKey::UpdateSubscriptions);
    }

    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $this->hasBaseAccess($user);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Subscription $subscription): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->hasBaseAccess($user) && $subscription->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermission(PermissionKey::CreateSubscriptions);
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Subscription $subscription): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $user->hasPermission(PermissionKey::UpdateSubscriptions) && $subscription->branch_id === $user->branch_id;
    }

    /**
     * Changing one field of many subscriptions at once from the list (see
     * SubscriptionBulkChangeController): the status takes "Edit Subscriptions",
     * the minimum charge also its own permission. Which subscriptions it
     * reaches is limited to the user's branch by the query itself.
     */
    public function bulkUpdate(User $user, string $field): bool
    {
        if (! $user->hasPermission(PermissionKey::BulkUpdateSubscriptions)) {
            return false;
        }

        return match ($field) {
            'status' => $user->hasPermission(PermissionKey::UpdateSubscriptions),
            'minimum_charge' => $user->hasPermission(PermissionKey::UpdateSubscriptions)
                && $user->hasPermission(PermissionKey::UpdateSubscriptionMinimumCharge),
            default => false,
        };
    }

    /**
     * Recording a payment takes the "Record Collections" permission, for a
     * subscription of the user's own branch (any branch for the Super Admin).
     */
    public function recordPayment(User $user, Subscription $subscription): bool
    {
        return $user->hasPermission(PermissionKey::RecordCollections)
            && ($user->isSuperAdmin() || $subscription->branch_id === $user->branch_id);
    }

    /**
     * Adding a charge (a penalty or disconnection fee), a discount or a
     * clearing by hand takes its own permission, for a subscription of the
     * user's own branch (any branch for the Super Admin).
     */
    public function adjustBalance(User $user, Subscription $subscription): bool
    {
        return $user->hasPermission(PermissionKey::AdjustBalances)
            && ($user->isSuperAdmin() || $subscription->branch_id === $user->branch_id);
    }

    /**
     * Deleting takes its own permission, for a subscription of the user's
     * own branch (any branch for the Super Admin).
     */
    public function delete(User $user, Subscription $subscription): bool
    {
        return $user->hasPermission(PermissionKey::DeleteSubscriptions)
            && ($user->isSuperAdmin() || $subscription->branch_id === $user->branch_id);
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, Subscription $subscription): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, Subscription $subscription): bool
    {
        return false;
    }
}
