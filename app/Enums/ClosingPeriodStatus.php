<?php

namespace App\Enums;

enum ClosingPeriodStatus: string
{
    case Open = 'open';
    case ReadyToClose = 'ready_to_close';
    case Closed = 'closed';
    case UnderAudit = 'under_audit';
    case Audited = 'audited';

    public function isClosed(): bool
    {
        return in_array($this, [self::Closed, self::UnderAudit, self::Audited], true);
    }

    public function label(): string
    {
        return match ($this) {
            self::Open => 'مفتوح', self::ReadyToClose => 'جاهز للإغلاق', self::Closed => 'مغلق', self::UnderAudit => 'قيد التدقيق', self::Audited => 'مدقّق',
        };
    }
}
