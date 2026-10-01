<?php

namespace App\Support;

interface ReceiptParserInterface
{
    /** @return array<string, mixed> */
    public function parse(string $text, float $ocrConfidence): array;
}
