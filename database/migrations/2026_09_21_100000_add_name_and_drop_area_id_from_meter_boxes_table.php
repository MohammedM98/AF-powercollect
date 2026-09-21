<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A meter box's area/governorate now come from its branch (which
     * already carries both), so the direct area_id link is redundant —
     * dropped in favor of a human-readable name instead.
     */
    public function up(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('area_id');
            $table->string('name')->nullable()->after('id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->dropColumn('name');
            $table->foreignId('area_id')->nullable()->after('branch_id')->constrained()->nullOnDelete();
        });
    }
};
