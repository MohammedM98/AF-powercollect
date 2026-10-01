<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Receipts are now read on the collector's phone, so the server no longer
 * keeps receipt images, their OCR results or the reference examples. The
 * stored images go too; rolling back recreates the tables empty.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('payment_receipts');
        Schema::dropIfExists('receipt_example_runs');
        Schema::dropIfExists('receipt_examples');
        Schema::dropIfExists('payment_providers');

        Storage::disk('local')->deleteDirectory('payment-receipts');
        Storage::disk('local')->deleteDirectory('receipt-examples');
    }

    public function down(): void
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

        Schema::create('receipt_examples', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('provider_id')->constrained('payment_providers')->restrictOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('title', 150);
            $table->string('layout', 100);
            $table->string('purpose', 20)->default('tuning');
            $table->string('original_file_path');
            $table->char('file_hash', 64)->unique();
            $table->longText('verified_fields');
            $table->unsignedInteger('verification_version')->default(1);
            $table->timestamps();
        });

        Schema::create('receipt_example_runs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('receipt_example_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tested_by')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('verification_version');
            $table->char('parser_version', 64);
            $table->string('mode', 20)->default('cloud');
            $table->string('status', 20)->default('pending');
            $table->float('ocr_confidence')->default(0);
            $table->longText('ocr_raw_response')->nullable();
            $table->longText('extracted_fields')->nullable();
            $table->longText('expected_fields');
            $table->longText('comparison')->nullable();
            $table->string('error')->nullable();
            $table->timestamp('tested_at')->nullable();
            $table->timestamps();
        });
    }
};
