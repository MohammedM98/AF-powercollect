<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

enum PaymentMethod: string
{
    use HasOptions;

    case Cash = 'cash';
    case BankTransfer = 'bank_transfer';
    case Cheque = 'cheque';
    case EWallet = 'e_wallet';

    public function label(): string
    {
        return match ($this) {
            self::Cash => 'Cash',
            self::BankTransfer => 'Bank Transfer',
            self::Cheque => 'Cheque',
            self::EWallet => 'E-Wallet',
        };
    }

    /**
     * Whether a payment this way goes through a bank, so the bank and the
     * transfer or cheque number are recorded with it.
     */
    public function throughBank(): bool
    {
        return in_array($this, [self::BankTransfer, self::Cheque], true);
    }
}
