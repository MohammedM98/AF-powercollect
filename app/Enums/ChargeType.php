<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

/**
 * A charge (تحميل) recorded by hand on a subscriber's account. Weekly
 * readings and the subscription fee are charged on their own.
 */
enum ChargeType: string
{
    use HasOptions;

    case Settlement = 'settlement';
    case Penalty = 'penalty';
    case DisconnectionFee = 'disconnection_fee';

    public function label(): string
    {
        return match ($this) {
            self::Settlement => 'Settlement',
            self::Penalty => 'Financial Penalty',
            self::DisconnectionFee => 'Service Disconnection Fee',
        };
    }

    /**
     * What a charge of this type usually comes to, suggested in the form,
     * or null when it varies.
     */
    public function usualAmount(): ?float
    {
        $amount = config('powercollect.usual_charges.'.$this->value);

        return $amount === null ? null : (float) $amount;
    }

    /**
     * Whether the charge must say why (it shows on the statement): a
     * penalty always does.
     */
    public function needsReason(): bool
    {
        return $this === self::Penalty;
    }

    /**
     * Every type as the charge form offers it.
     *
     * @return array<int, array{value: string, label: string, usualAmount: ?float, needsReason: bool}>
     */
    public static function formOptions(): array
    {
        return array_map(fn (self $type): array => [
            'value' => $type->value,
            'label' => __($type->label()),
            'usualAmount' => $type->usualAmount(),
            'needsReason' => $type->needsReason(),
        ], self::cases());
    }
}
