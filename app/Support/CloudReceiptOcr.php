<?php

namespace App\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class CloudReceiptOcr
{
    /** @return array{raw: array<string, mixed>, text: string, confidence: float} */
    public function recognize(UploadedFile $image): array
    {
        $key = config('receipt_ocr.google_api_key');
        if (! is_string($key) || $key === '') {
            throw new RuntimeException('لم تُفعّل خدمة قراءة الإيصالات بعد. أدخل بيانات الإيصال يدويًا.');
        }
        try {
            $response = Http::acceptJson()->withHeaders(['X-Goog-Api-Key' => $key])
                ->connectTimeout(5)->timeout(config('receipt_ocr.timeout'))
                ->post('https://vision.googleapis.com/v1/images:annotate', [
                    'requests' => [[
                        'image' => ['content' => base64_encode($image->getContent())],
                        'features' => [['type' => 'DOCUMENT_TEXT_DETECTION']],
                        'imageContext' => ['languageHints' => ['ar', 'en']],
                    ]],
                ]);
        } catch (ConnectionException) {
            throw new RuntimeException('تعذر الاتصال بخدمة قراءة الإيصالات. أدخل البيانات يدويًا.');
        }
        if (! $response->successful() || ! is_array($response->json())) {
            throw new RuntimeException('خدمة قراءة الإيصالات غير متاحة. أدخل البيانات يدويًا.');
        }
        $raw = $response->json();
        if (! isset($raw['responses'][0]) || isset($raw['responses'][0]['error'])) {
            throw new RuntimeException('تعذر قراءة الصورة. جرّب صورة أوضح أو أدخل البيانات يدويًا.');
        }
        $annotation = $raw['responses'][0]['fullTextAnnotation'] ?? [];
        $confidences = [];
        foreach ($annotation['pages'] ?? [] as $page) {
            foreach ($page['blocks'] ?? [] as $block) {
                foreach ($block['paragraphs'] ?? [] as $paragraph) {
                    foreach ($paragraph['words'] ?? [] as $word) {
                        if (isset($word['confidence']) && is_numeric($word['confidence'])) {
                            $confidences[] = max(0, min(1, (float) $word['confidence']));
                        }
                    }
                }
            }
        }
        $text = $annotation['text'] ?? $raw['responses'][0]['textAnnotations'][0]['description'] ?? '';

        return ['raw' => $raw, 'text' => is_string($text) ? $text : '',
            'confidence' => $confidences === [] ? 0.0 : array_sum($confidences) / count($confidences)];
    }
}
