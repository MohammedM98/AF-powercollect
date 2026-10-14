<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A collector's confirmation of the weekly closing the branch closed: owed
 * while `confirmed_at` is empty.
 */
#[Fillable(['closing_id', 'user_id', 'confirmed_at'])]
class ClosingConfirmation extends Model
{
    protected function casts(): array
    {
        return ['confirmed_at' => 'datetime'];
    }

    public function closing(): BelongsTo
    {
        return $this->belongsTo(Closing::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
