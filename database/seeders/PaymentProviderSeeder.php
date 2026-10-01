<?php

namespace Database\Seeders;

use App\Models\PaymentProvider;
use Illuminate\Database\Seeder;

class PaymentProviderSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['bank_of_palestine', 'Bank of Palestine', 'بنك فلسطين', 'bank'],
            ['jawwal_pay', 'Jawwal Pay', 'جوال باي', 'wallet'],
            ['palpay', 'PalPay', 'محفظة بالباي', 'wallet'],
            ['palestine_islamic_bank', 'Palestine Islamic Bank', 'البنك الإسلامي الفلسطيني', 'bank'],
        ] as [$code, $nameEn, $nameAr, $type]) {
            PaymentProvider::query()->firstOrCreate(['code' => $code],
                ['name_en' => $nameEn, 'name_ar' => $nameAr, 'type' => $type, 'is_active' => true]);
        }
    }
}
