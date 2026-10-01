<?php

namespace App\Support;

class BankOfPalestineReceiptParser implements ReceiptParserInterface
{
    public function parse(string $text, float $ocrConfidence): array
    {
        $text = ReceiptText::normalize($text);
        $labels = ReceiptText::labels();
        $labels['transaction_reference'] = [...ReceiptText::labels()['transaction_reference'], 'Transfer No.', 'رقم الحركة'];
        $labels['sender_name'] = [...ReceiptText::labels()['sender_name'], 'Ordering customer', 'اسم المحول منه'];
        $labels['amount'] = ['المبلغ الإجمالي', 'المبلغ الاجمالي', ...$labels['amount']];
        $labels['transferred_at'] = ['تاريخ الحركة', ...$labels['transferred_at']];
        $section = ReceiptText::senderSection($text);
        if ($section !== null) {
            $labels['sender_name'][] = 'من حساب';
            $labels['sender_account'][] = 'الحساب';
            $text = preg_replace('/\n\s*(?:معلومات|بيانات)\s+المرسل\s+(?:إليه|اليه).*?(?=\n\s*بيانات\s+الحوالة|\z)/su', '', $text);
        }
        if (preg_match('/إشعار\s+تحويل\s+لمستفيد\s+في\s+بنك\s+فلسطين/u', $text)
            && preg_match('/(?:^|\n)\s*من\s*\n(.*?)(?=\n\s*إلى\s*(?:\n|$))/su', $text, $match)) {
            $senderLines = [];
            foreach (preg_split('/[\r\n]+/', trim($match[1])) as $line) {
                $value = ReceiptText::amount($line);
                if ($value !== null) {
                    $text .= "\nAmount: ".$value;
                } elseif (preg_match('/^[\p{L}\s.]+$/u', trim($line))) {
                    $senderLines[] = trim($line);
                }
            }
            if ($senderLines !== []) {
                $text .= "\nSender name: ".implode(' ', $senderLines);
            }
        }

        return ReceiptText::extract($text, $labels, $ocrConfidence);
    }
}
