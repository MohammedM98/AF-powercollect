<?php

return [
    'google_api_key' => env('RECEIPT_OCR_GOOGLE_API_KEY'),
    'timezone' => env('RECEIPT_OCR_TIMEZONE', 'Asia/Hebron'),
    'timeout' => 25,
    'confidence_threshold' => 0.85,
    'old_receipt_days' => 30,
];
