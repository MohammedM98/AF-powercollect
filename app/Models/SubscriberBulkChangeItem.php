<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One subscriber's value before and after a bulk change.
 */
#[Fillable(['subscriber_bulk_change_id', 'subscriber_id', 'old_value', 'new_value'])]
class SubscriberBulkChangeItem extends Model
{
    public $timestamps = false;

    public function change(): BelongsTo
    {
        return $this->belongsTo(SubscriberBulkChange::class, 'subscriber_bulk_change_id');
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }
}
