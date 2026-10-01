<?php

namespace App\Support;

use App\Models\ReceiptExample;
use App\Models\ReceiptExampleRun;
use Carbon\CarbonImmutable;

class ReceiptAccuracy
{
    public const FIELD_LABELS = ['provider' => 'البنك أو المحفظة', 'transaction_reference' => 'رقم التحويل',
        'sender_name' => 'اسم المرسل', 'sender_account' => 'حساب المرسل', 'amount' => 'المبلغ',
        'currency' => 'العملة', 'transferred_at' => 'تاريخ التحويل'];

    public static function parserVersion(): string
    {
        $source = '';
        foreach (['ReceiptText', 'ReceiptExtraction', 'BankOfPalestineReceiptParser', 'JawwalPayReceiptParser', 'PalPayReceiptParser', 'PalestineIslamicBankReceiptParser'] as $class) {
            $source .= file_get_contents(app_path('Support/'.$class.'.php'));
        }

        return hash('sha256', $source.json_encode([config('receipt_ocr.timezone'), config('receipt_ocr.confidence_threshold'), config('receipt_ocr.old_receipt_days')]));
    }

    /** @param array<string, mixed> $expected @param array<string, mixed> $extracted @return array{fields: array<string, array{label: string, expected: mixed, extracted: mixed, matches: bool}>, matched: int, total: int} */
    public static function compare(array $expected, array $extracted): array
    {
        $fields = [];
        foreach (self::FIELD_LABELS as $field => $label) {
            if ($field === 'sender_account' && empty($expected[$field])) {
                continue;
            }
            $actual = $extracted[$field] ?? null;
            $correct = $expected[$field] ?? null;
            $normalizedActual = $actual === null ? null : self::normalize($field, (string) $actual);
            $fields[$field] = ['label' => $label, 'expected' => $correct, 'extracted' => $actual,
                'matches' => filled($normalizedActual) && $normalizedActual === self::normalize($field, (string) $correct)];
        }

        return ['fields' => $fields, 'matched' => count(array_filter($fields, fn (array $field): bool => $field['matches'])), 'total' => count($fields)];
    }

    private static function normalize(string $field, string $value): ?string
    {
        if ($field === 'transaction_reference' || $field === 'sender_account') {
            return ReceiptText::reference($value);
        }
        if ($field === 'amount') {
            return ReceiptText::amount($value);
        }
        if ($field === 'transferred_at') {
            $date = ReceiptText::date($value);

            return $date === null ? null : CarbonImmutable::parse($date)->setTimezone(config('receipt_ocr.timezone'))->toDateString();
        }

        return mb_strtoupper(trim(preg_replace('/\s+/u', ' ', ReceiptText::normalize($value))));
    }

    public static function isCurrent(ReceiptExample $example, ?ReceiptExampleRun $run, string $parserVersion): bool
    {
        return $run !== null && $run->status === 'processed'
            && $run->verification_version === $example->verification_version && $run->parser_version === $parserVersion;
    }

    /** @return list<array<string, mixed>> */
    public static function summary(string $parserVersion): array
    {
        $groups = [];
        foreach (ReceiptExample::query()->with(['provider', 'latestRun:receipt_example_runs.id,receipt_example_runs.receipt_example_id,status,verification_version,parser_version,comparison'])->lazyById(100) as $example) {
            $key = $example->provider_id.'|'.$example->layout.'|'.$example->purpose;
            $groups[$key] ??= ['provider' => $example->provider->name_ar, 'layout' => $example->layout,
                'purpose' => $example->purpose, 'examples' => 0, 'tested' => 0, 'matched' => 0, 'total' => 0, 'fields' => []];
            $groups[$key]['examples']++;
            if (! self::isCurrent($example, $example->latestRun, $parserVersion)) {
                continue;
            }
            $comparison = $example->latestRun->comparison;
            $groups[$key]['tested']++;
            $groups[$key]['matched'] += $comparison['matched'];
            $groups[$key]['total'] += $comparison['total'];
            foreach ($comparison['fields'] as $field => $result) {
                $groups[$key]['fields'][$field] ??= ['label' => $result['label'], 'matched' => 0, 'total' => 0];
                $groups[$key]['fields'][$field]['total']++;
                $groups[$key]['fields'][$field]['matched'] += (int) $result['matches'];
            }
        }

        return array_values($groups);
    }
}
