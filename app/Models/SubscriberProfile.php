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
     * Every new person gets the next subscriber number automatically; it is
     * never taken from user input. Their subscriptions keep their own
     * account numbers.
     *
     * Keep the subscription's searchable personal fields in sync with its
     * shared profile. Financial data and meter assignments stay separate.
     */
    protected static function booted(): void
    {
        static::creating(function (SubscriberProfile $profile): void {
            $profile->subscriber_number ??= static::nextSubscriberNumber();
        });

        static::saved(function (SubscriberProfile $profile): void {
            if ($profile->wasChanged(self::PERSONAL_FIELDS)) {
                $profile->subscriptions()->update($profile->only(self::PERSONAL_FIELDS));
            }
        });
    }

    /** The number after the highest one given so far: 1, 2, 3… */
    public static function nextSubscriberNumber(): int
    {
        return (int) static::query()->orderByDesc('subscriber_number')->lockForUpdate()->value('subscriber_number') + 1;
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }
}
