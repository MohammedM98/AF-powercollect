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
        Schema::table('reading_entry_settings', function (Blueprint $table) {
            $table->time('opens_at')->default('00:00:00');
            $table->time('closes_at')->default('23:59:00');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('reading_entry_settings', function (Blueprint $table) {
            $table->dropColumn(['opens_at', 'closes_at']);
        });
    }
};
