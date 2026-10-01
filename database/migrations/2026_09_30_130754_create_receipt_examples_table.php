<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        Schema::dropIfExists('receipt_example_runs');
        Schema::dropIfExists('receipt_examples');
    }
};
