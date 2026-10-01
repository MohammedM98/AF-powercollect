<?php

namespace App\Support;

class PalPayReceiptParser implements ReceiptParserInterface
{
    public function parse(string $text, float $ocrConfidence): array
    {
        $labels = ReceiptText::labels();
        $labels['transaction_reference'] = [...ReceiptText::labels()['transaction_reference'], 'Transaction code', 'رقم الحوالة'];
        $labels['sender_name'] = [...ReceiptText::labels()['sender_name'], 'Sent by', 'اسم المرسل'];
        $labels['sender_account'] = [...ReceiptText::labels()['sender_account'], 'Sender wallet', 'محفظة المرسل'];

        return ReceiptText::extract($text, $labels, $ocrConfidence);
    }
}
