<?php

namespace App\Support;

use Carbon\CarbonImmutable;

class ReceiptText
{
    public static function normalize(string $text): string
    {
        $text = strtr($text, array_combine(
            preg_split('//u', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY),
            str_split('01234567890123456789'),
        ));

        return preg_replace('/[\x{200e}\x{200f}\x{202a}-\x{202e}\x{2066}-\x{2069}\x{064b}-\x{065f}\x{0670}\x{0640}]/u', '', $text);
    }

    public static function reference(string $reference): string
    {
        return mb_strtoupper(preg_replace('/[\s\-\/]+/u', '', self::normalize($reference)));
    }

    public static function amount(string $value): ?string
    {
        $value = trim(strtr(self::normalize($value), ['٬' => ',', '٫' => '.']));
        $value = trim(preg_replace('/\b(?:ILS|NIS|USD|JOD|shekels?)\b|₪|\$|شيكل|دولار\s*(?:أمريكي|امريكي)?|دينار\s*(?:أردني|اردني)?/iu', '', $value));
        if (preg_match('/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/', $value)) {
            $value = str_replace(',', '', $value);
        } elseif (preg_match('/^\d+,\d{1,2}$/', $value)) {
            $value = str_replace(',', '.', $value);
        }
        if (! preg_match('/^\d+(?:\.\d{1,2})?$/', $value) || (float) $value <= 0 || (float) $value > 1000000) {
            return null;
        }

        return number_format((float) $value, 2, '.', '');
    }

    public static function senderSection(string $text): ?string
    {
        if (preg_match('/(?:^|\n)\s*بيانات\s+المرسل\s*\n(.*?)(?=\n\s*(?:معلومات|بيانات)\s+المرسل\s+(?:إليه|اليه)|\z)/su', self::normalize($text), $match)) {
            return $match[1];
        }

        return null;
    }

    public static function date(string $value): ?string
    {
        foreach (['!Y-m-d H:i:s', '!Y-m-d H:i', '!Y-m-d', '!d/m/Y H:i:s', '!d/m/Y H:i', '!d/m/Y', '!d-m-Y H:i', '!d-m-Y'] as $format) {
            try {
                $date = CarbonImmutable::createFromFormat($format, trim($value), config('receipt_ocr.timezone'));
                if ($date && $date->format(ltrim($format, '!')) === trim($value)) {
                    return $date->toIso8601String();
                }
            } catch (\InvalidArgumentException) {
                continue;
            }
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/', trim($value))) {
            $value = preg_replace('/Z$/', '+00:00', trim($value));
            foreach (['!Y-m-d\TH:i:sP', '!Y-m-d\TH:iP'] as $format) {
                try {
                    $date = CarbonImmutable::createFromFormat($format, $value);
                    if ($date && $date->format(ltrim($format, '!')) === $value) {
                        return $date->toIso8601String();
                    }
                } catch (\InvalidArgumentException) {
                    continue;
                }
            }
        }

        return null;
    }

    /**
     * @param  array<string, list<string>>  $labels
     * @return array<string, mixed>
     */
    public static function extract(string $text, array $labels, float $ocrConfidence): array
    {
        $normalized = self::normalize($text);
        $lines = array_values(array_filter(array_map('trim', preg_split('/[\r\n]+/', $normalized))));
        $allLabels = array_merge(...array_values($labels));
        $allPattern = implode('|', array_map(fn (string $label): string => preg_quote($label, '/'), $allLabels));
        $fields = [];
        $confidence = [];
        $warnings = [];
        $fieldNames = ['amount' => 'المبلغ', 'currency' => 'العملة',
            'transaction_reference' => 'رقم التحويل', 'sender_name' => 'اسم المرسل',
            'sender_account' => 'حساب المرسل', 'transferred_at' => 'تاريخ التحويل'];
        foreach ($labels as $field => $fieldLabels) {
            usort($fieldLabels, fn (string $left, string $right): int => mb_strlen($right) <=> mb_strlen($left));
            $pattern = implode('|', array_map(fn (string $label): string => preg_quote($label, '/'), $fieldLabels));
            $reverseLabels = array_filter($fieldLabels, fn (string $label): bool => (bool) preg_match('/\p{Arabic}/u', $label));
            $reversePattern = implode('|', array_map(fn (string $label): string => preg_quote($label, '/'), $reverseLabels));
            $candidates = [];
            foreach ($lines as $index => $line) {
                if (preg_match('/^(?:بيانات|معلومات)\s+(?:المرسل|الحوالة)/u', $line)) {
                    continue;
                }
                $forwardMatch = preg_match('/(?:^|[\s|])(?:'.$pattern.')(?=\s|[:：#=\-]|$)\s*[:：#=\-]?\s*(.*)$/iu', $line, $match);
                if ($forwardMatch && trim($match[1]) !== '') {
                    $value = trim(preg_split('/\s+(?:'.$allPattern.')\s*[:：#=]/iu', $match[1], 2)[0], " \t|");
                } elseif ($reverseLabels !== [] && preg_match('/^(.+?)\s+(?:'.$reversePattern.')\s*[:：#=]?\s*$/iu', $line, $match)) {
                    $value = trim($match[1], " \t|");
                } elseif ($forwardMatch) {
                    $value = '';
                } else {
                    continue;
                }
                if ($value === '' && isset($lines[$index + 1]) && ! preg_match('/^(?:'.$allPattern.')(?=\s|[:：#=\-]|$)/iu', $lines[$index + 1])) {
                    $value = $lines[$index + 1];
                }
                $value = match ($field) {
                    'amount' => self::amount($value),
                    'transaction_reference' => preg_match('/^[A-Za-z0-9][A-Za-z0-9\s\/\-]{2,99}$/', $value) && preg_match('/\d/', $value) ? $value : null,
                    'sender_name' => preg_match('/[A-Za-z\x{0621}-\x{064a}]/u', $value) && ! preg_match('/\d{5,}|@|https?:/iu', $value) && mb_strlen($value) <= 255 ? $value : null,
                    'sender_account' => preg_match('/^[A-Za-z0-9* \-]{3,100}$/', $value) ? $value : null,
                    'transferred_at' => self::date($value),
                    default => $value !== '' ? $value : null,
                };
                if ($value !== null) {
                    $candidates[] = $value;
                }
            }
            $candidates = array_values(array_unique($candidates));
            $fields[$field] = count($candidates) === 1 ? $candidates[0] : null;
            $confidence[$field] = $fields[$field] === null ? 0.0 : round(min(0.95, $ocrConfidence), 3);
            if (count($candidates) > 1) {
                $warnings[] = ['field' => $field, 'code' => 'ambiguous', 'message' => $fieldNames[$field].': ظهرت قيم مختلفة؛ اختر القيمة الصحيحة من الإيصال.'];
            }
        }
        $currencies = [];
        foreach ([
            'ILS' => '/\b(?:ILS|NIS|shekels?)\b|₪|شيكل/iu',
            'USD' => '/\bUSD\b|\$|دولار/iu',
            'JOD' => '/\bJOD\b|دينار/iu',
            'EUR' => '/\bEUR\b|€|يورو/iu',
        ] as $currency => $pattern) {
            if (preg_match($pattern, $normalized)) {
                $currencies[] = $currency;
            }
        }
        $fields['currency'] = count($currencies) === 1 ? $currencies[0] : null;
        $confidence['currency'] = $fields['currency'] === null ? 0 : min(0.95, $ocrConfidence);
        foreach (['amount', 'currency', 'transaction_reference', 'sender_name', 'transferred_at'] as $field) {
            if ($fields[$field] === null) {
                $warnings[] = ['field' => $field, 'code' => 'missing', 'message' => $fieldNames[$field].': لم تُقرأ قيمة واضحة؛ أدخلها من الإيصال.'];
            } elseif ($confidence[$field] < config('receipt_ocr.confidence_threshold')) {
                $warnings[] = ['field' => $field, 'code' => 'low_confidence', 'message' => $fieldNames[$field].': دقة القراءة منخفضة؛ راجع هذه القيمة.'];
            }
        }

        return [...$fields, 'confidence' => $confidence, 'warnings' => $warnings];
    }

    /** @return array<string, list<string>> */
    public static function labels(): array
    {
        return [
            'transaction_reference' => ['Transaction reference', 'Transaction number', 'Transaction ID', 'Transaction No.', 'Transaction No', 'Transfer number', 'Reference number', 'Reference No.', 'Reference No', 'Reference', 'رقم التحويل', 'رقم الحوالة', 'رقم العملية', 'رقم المعاملة', 'الرقم المرجعي', 'رقم المرجع'],
            'sender_name' => ['Sender name', 'Payer name', 'Sender', 'Payer', 'From', 'اسم المرسل', 'اسم المحول', 'اسم الدافع', 'المرسل', 'المحول'],
            'amount' => ['Transfer amount', 'Transaction amount', 'Paid amount', 'Amount paid', 'Amount', 'مبلغ التحويل', 'مبلغ الحوالة', 'المبلغ المحول', 'المبلغ المدفوع', 'المبلغ', 'مبلغ'],
            'sender_account' => ['Sender account', 'From account', 'حساب المرسل', 'رقم حساب المرسل'],
            'transferred_at' => ['Transaction date', 'Transfer date', 'Date and time', 'Date', 'تاريخ التحويل', 'تاريخ الحوالة', 'تاريخ العملية', 'التاريخ والوقت', 'التاريخ'],
        ];
    }
}
