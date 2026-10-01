<?php

namespace App\Support;

use App\Models\PaymentProvider;
use Carbon\CarbonImmutable;

class ReceiptExtraction
{
    /** @return array<string, mixed> */
    public function extract(string $text, float $ocrConfidence, ?PaymentProvider $selectedProvider = null): array
    {
        $text = ReceiptText::normalize($text);
        $classificationText = preg_replace('/\s+/u', ' ', ReceiptText::senderSection($text) ?? $text);
        $markers = [
            'bank_of_palestine' => ['bank of palestine', 'بنك فلسطين'],
            'jawwal_pay' => ['jawwal pay', 'jawwalpay', 'جوال باي', 'جوالباي'],
            'palpay' => ['palpay', 'pal pay', 'بال باي', 'بالبي', 'بالباي'],
            'palestine_islamic_bank' => ['palestine islamic bank', 'البنك الإسلامي الفلسطيني', 'البنك الاسلامي الفلسطيني'],
        ];
        $matches = [];
        foreach ($markers as $code => $names) {
            foreach ($names as $name) {
                if (str_contains(mb_strtolower($classificationText), $name)) {
                    $matches[$code] = min(0.98, $ocrConfidence);
                }
            }
        }
        $detectedCode = count($matches) === 1 ? array_key_first($matches) : null;
        $detected = $detectedCode ? PaymentProvider::query()->where('code', $detectedCode)->where('is_active', true)->first() : null;
        $provider = $selectedProvider ?? $detected;
        $parser = match ($provider?->code) {
            'bank_of_palestine' => new BankOfPalestineReceiptParser,
            'jawwal_pay' => new JawwalPayReceiptParser,
            'palpay' => new PalPayReceiptParser,
            'palestine_islamic_bank' => new PalestineIslamicBankReceiptParser,
            default => null,
        };
        $result = $parser?->parse($text, $ocrConfidence) ?? ReceiptText::extract($text, ReceiptText::labels(), $ocrConfidence);
        $providerConfidence = $detected ? $matches[$detectedCode] : 0.0;
        $result['confidence']['provider'] = $providerConfidence;
        if (! $detected || $providerConfidence < config('receipt_ocr.confidence_threshold')) {
            $result['warnings'][] = ['field' => 'provider', 'code' => 'provider_uncertain', 'message' => 'اختر البنك أو المحفظة وتأكد منهما في الإيصال.'];
        }
        if ($selectedProvider && $detected && $selectedProvider->id !== $detected->id) {
            $result['warnings'][] = ['field' => 'provider', 'code' => 'provider_mismatch', 'message' => 'اسم المزود المقروء يختلف عن اختيارك؛ راجع البنك أو المحفظة.'];
        }
        if ($result['transferred_at'] !== null) {
            $result['warnings'] = [...$result['warnings'], ...self::dateWarnings($result['transferred_at'])];
        }

        return [...$result, 'provider_id' => $provider?->id, 'provider' => $provider?->code,
            'detected_provider_id' => $detected?->id, 'provider_confidence' => $providerConfidence];
    }

    /** @return list<array{field: string, code: string, message: string}> */
    public static function dateWarnings(string $date): array
    {
        $date = CarbonImmutable::parse($date);
        if ($date->isFuture()) {
            return [['field' => 'transferred_at', 'code' => 'future_date', 'message' => 'تاريخ التحويل في المستقبل؛ راجعه قبل التسجيل.']];
        }
        if ($date->lt(now()->subDays(config('receipt_ocr.old_receipt_days')))) {
            return [['field' => 'transferred_at', 'code' => 'old_date', 'message' => 'الإيصال قديم؛ تأكد أنه لم يُسجل سابقًا.']];
        }

        return [];
    }
}
