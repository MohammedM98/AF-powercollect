<?php

namespace App\Support;

class PalestineIslamicBankReceiptParser implements ReceiptParserInterface
{
    public function parse(string $text, float $ocrConfidence): array
    {
        $labels = ReceiptText::labels();
        $labels['transaction_reference'] = [...ReceiptText::labels()['transaction_reference'], 'Transfer reference', 'رقم الحوالة'];
        $labels['sender_name'] = [...ReceiptText::labels()['sender_name'], 'Ordering customer', 'اسم صاحب الحساب'];

        return ReceiptText::extract($text, $labels, $ocrConfidence);
    }
}
