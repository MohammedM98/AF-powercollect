<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

/**
 * What a message to subscriptions is about, which decides who can get it
 * and which details its text can fill in.
 */
enum MessageKind: string
{
    use HasOptions;

    /** Their reading for a week: previous and current reading, consumption and amount due. */
    case WeeklyReading = 'weekly_reading';

    /** A reminder to pay what they still owe. */
    case BalanceReminder = 'balance_reminder';

    /** Any other news, e.g. an outage or a new schedule. */
    case Custom = 'custom';

    public function label(): string
    {
        return match ($this) {
            self::WeeklyReading => 'Weekly Reading',
            self::BalanceReminder => 'Balance Reminder',
            self::Custom => 'Custom Message',
        };
    }
}
