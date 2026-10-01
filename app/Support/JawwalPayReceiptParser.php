<?php

namespace App\Support;

class JawwalPayReceiptParser implements ReceiptParserInterface
{
    public function parse(string $text, float $ocrConfidence): array
    {
        $labels = ReceiptText::labels();
        $labels['transaction_reference'] = [...ReceiptText::labels()['transaction_reference'], 'Transaction code', 'رقم الحركة'];
        $labels['sender_name'] = [...ReceiptText::labels()['sender_name'], 'اسم المرسل', 'Sent by'];
        $labels['sender_account'] = [...ReceiptText::labels()['sender_account'], 'Sender mobile', 'رقم جوال المرسل'];

        return ReceiptText::extract($text, $labels, $ocrConfidence);
    }
}
