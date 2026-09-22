<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Unlike area/governorate (which a meter box always inherits from its
     * branch), a branch's meter boxes can be spread across several
     * sub-areas within that same area — so sub_area_id is stored directly
     * on the meter box.
     */
    public function up(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->foreignId('sub_area_id')->nullable()->after('branch_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sub_area_id');
        });
    }
};
