<?php

namespace App\Models;

use Database\Factories\SubscriberProfileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['full_name', 'national_id', 'phone', 'address'])]
class SubscriberProfile extends Model
{
    /** @use HasFactory<SubscriberProfileFactory> */
    use HasFactory;

    public const PERSONAL_FIELDS = ['full_name', 'national_id', 'phone', 'address'];

    /**
     * Keep the subscription's searchable personal fields in sync with its
     * shared profile. Financial data and meter assignments stay separate.
     */
    protected static function booted(): void
    {
        static::saved(function (SubscriberProfile $profile): void {
            if ($profile->wasChanged(self::PERSONAL_FIELDS)) {
                $profile->subscriptions()->update($profile->only(self::PERSONAL_FIELDS));
            }
        });
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }
}
