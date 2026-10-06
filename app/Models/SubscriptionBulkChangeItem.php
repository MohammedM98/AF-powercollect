<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One subscription's value before and after a bulk change.
 */
#[Fillable(['subscription_bulk_change_id', 'subscription_id', 'old_value', 'new_value'])]
class SubscriptionBulkChangeItem extends Model
{
    public $timestamps = false;

    public function change(): BelongsTo
    {
        return $this->belongsTo(SubscriptionBulkChange::class, 'subscription_bulk_change_id');
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
