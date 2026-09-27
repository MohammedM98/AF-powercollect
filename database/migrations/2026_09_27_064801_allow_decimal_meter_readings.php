<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Meter readings (kWh) can have up to two decimal places, e.g. 255.2.
     */
    public function up(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->decimal('initial_reading', 12, 2)->nullable()->change();
        });

        Schema::table('meter_readings', function (Blueprint $table) {
            $table->decimal('previous_reading', 12, 2)->change();
            $table->decimal('current_reading', 12, 2)->change();
            $table->decimal('consumption', 12, 2)->change();
        });
    }

    /**
     * Back to whole numbers; any decimal places are lost.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->unsignedInteger('initial_reading')->nullable()->change();
        });

        Schema::table('meter_readings', function (Blueprint $table) {
            $table->unsignedInteger('previous_reading')->change();
            $table->unsignedInteger('current_reading')->change();
            $table->unsignedInteger('consumption')->change();
        });
    }
};
