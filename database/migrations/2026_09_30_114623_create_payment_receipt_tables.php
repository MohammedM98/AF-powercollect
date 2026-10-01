<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_providers', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name_en');
            $table->string('name_ar');
            $table->string('type', 20);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        DB::table('payment_providers')->insert([
            ['code' => 'bank_of_palestine', 'name_en' => 'Bank of Palestine', 'name_ar' => 'بنك فلسطين', 'type' => 'bank', 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'jawwal_pay', 'name_en' => 'Jawwal Pay', 'name_ar' => 'جوال باي', 'type' => 'wallet', 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'palpay', 'name_en' => 'PalPay', 'name_ar' => 'محفظة بالباي', 'type' => 'wallet', 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'palestine_islamic_bank', 'name_en' => 'Palestine Islamic Bank', 'name_ar' => 'البنك الإسلامي الفلسطيني', 'type' => 'bank', 'created_at' => now(), 'updated_at' => now()],
        ]);

        Schema::create('payment_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payment_id')->nullable()->unique()->constrained('subscriber_transactions')->restrictOnDelete();
            $table->foreignId('collector_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('provider_id')->nullable()->constrained('payment_providers')->restrictOnDelete();
            $table->string('original_file_path');
            $table->char('file_hash', 64)->index();
            $table->char('confirmed_file_hash', 64)->nullable()->unique();
            $table->char('normalized_reference', 64)->nullable();
            $table->unique(['provider_id', 'normalized_reference'], 'receipt_provider_reference_unique');
            $table->string('ocr_status', 20)->default('pending');
            $table->decimal('provider_confidence', 4, 3)->default(0);
            $table->longText('ocr_raw_response')->nullable();
            $table->text('extracted_fields')->nullable();
            $table->text('confirmed_fields')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();
            $table->index(['collector_id', 'file_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_receipts');
        Schema::dropIfExists('payment_providers');
    }
};
