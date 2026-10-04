<?php

namespace App\Enums;

enum TransactionAction: string
{
    case Edit = 'edit';
    case EditMetadata = 'edit_metadata';
    case Delete = 'delete';
    case Cancel = 'cancel';
    case Refund = 'refund';

    /**
     * The canonical display order used by the transaction history.
     *
     * @return array<int, self>
     */
    public static function ordered(): array
    {
        return [self::Edit, self::EditMetadata, self::Delete, self::Cancel, self::Refund];
    }
}
