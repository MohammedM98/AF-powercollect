<?php

namespace App\Policies;

use App\Enums\CashTransferStatus;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\User;

class CashTransferPolicy
{
    /**
     * The recipient confirms the cash arrived; the Super Admin may confirm
     * it for them.
     */
    public function confirmReceipt(User $user, CashTransfer $transfer): bool
    {
        return $transfer->status === CashTransferStatus::InTransit
            && ($transfer->recipient_id === $user->id || $user->isSuperAdmin());
    }

    /**
     * The proof can be seen by anyone who can open the branch's closings,
     * and by the recipient.
     */
    public function view(User $user, CashTransfer $transfer): bool
    {
        return $transfer->recipient_id === $user->id || $user->can('viewBranch', [Closing::class, $transfer->branch]);
    }
}
