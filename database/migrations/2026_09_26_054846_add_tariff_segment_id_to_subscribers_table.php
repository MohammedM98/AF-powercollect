<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Nullable: a subscriber without a segment is simply its tariff's category (e.g. plain Residential).
        Schema::table('subscribers', function (Blueprint $table) {
            $table->foreignId('tariff_segment_id')->nullable()->after('tariff_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tariff_segment_id');
        });
    }
};
