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
        Schema::table('closing_settings', function (Blueprint $table): void {
            $table->boolean('allow_early_weekly_close')->default(false);
        });
        Schema::table('closing_periods', function (Blueprint $table): void {
            $table->dateTime('scheduled_cutoff_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('closing_periods', function (Blueprint $table): void {
            $table->dropColumn('scheduled_cutoff_at');
        });
        Schema::table('closing_settings', function (Blueprint $table): void {
            $table->dropColumn('allow_early_weekly_close');
        });
    }
};
