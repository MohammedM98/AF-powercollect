<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

enum ClosingStatus: string
{
    use HasOptions;

    case Draft = 'draft';
    case Locked = 'locked';
    case Submitted = 'submitted';
    case Returned = 'returned';
    case Approved = 'approved';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Locked => 'Closed by the branch',
            self::Submitted => 'Submitted for Review',
            self::Returned => 'Returned for Correction',
            self::Approved => 'Closing approved',
        };
    }

    /**
     * Whether the branch can still change the closing: before it is sent
     * for review, or once the reviewer has sent it back.
     */
    public function isEditable(): bool
    {
        return $this === self::Draft || $this === self::Returned;
    }
}
