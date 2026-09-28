<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;
use App\Models\SubscriberTransaction;

/**
 * Why a line of a subscriber's account was corrected (cancelled and
 * entered again) or deleted (cancelled only).
 */
enum CorrectionReason: string
{
    use HasOptions;

    case WrongAmount = 'wrong_amount';
    case WrongPaymentMethod = 'wrong_payment_method';
    case WrongCurrency = 'wrong_currency';
    case WrongType = 'wrong_type';
    case WrongDetails = 'wrong_details';
    case WrongSubscriber = 'wrong_subscriber';
    case Duplicate = 'duplicate';
    case NotReceived = 'not_received';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::WrongAmount => 'Wrong amount',
            self::WrongPaymentMethod => 'Wrong payment method',
            self::WrongCurrency => 'Wrong currency or exchange rate',
            self::WrongType => 'Wrong type',
            self::WrongDetails => 'Wrong details',
            self::WrongSubscriber => 'Recorded on the wrong subscriber',
            self::Duplicate => 'Duplicate entry',
            self::NotReceived => 'Money not received',
            self::Other => 'Other reason',
        };
    }

    /**
     * The reasons offered when correcting the given line.
     *
     * @return array<int, self>
     */
    public static function forCorrectionOf(SubscriberTransaction $line): array
    {
        return $line->isPayment() ? self::forPaymentCorrection() : self::forAdjustmentCorrection();
    }

    /**
     * The reasons offered when correcting a payment.
     *
     * @return array<int, self>
     */
    public static function forPaymentCorrection(): array
    {
        return [self::WrongAmount, self::WrongPaymentMethod, self::WrongCurrency, self::WrongDetails, self::Other];
    }

    /**
     * The reasons offered when correcting a charge or a discount.
     *
     * @return array<int, self>
     */
    public static function forAdjustmentCorrection(): array
    {
        return [self::WrongAmount, self::WrongType, self::WrongDetails, self::Other];
    }

    /**
     * The reasons offered when deleting a line.
     *
     * @return array<int, self>
     */
    public static function forDeletion(): array
    {
        return [self::WrongSubscriber, self::Duplicate, self::NotReceived, self::Other];
    }
}
