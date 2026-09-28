<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The customer segment a standing discount is given to (e.g. موظفو أبو
     * زايد، مساجد), typed with it and copied onto each reading it bills,
     * like its terms, so the reading's discount line can name it.
     */
    public function up(): void
    {
        Schema::table('standing_discounts', function (Blueprint $table) {
            $table->string('segment', 100)->nullable()->after('value');
        });

        Schema::table('meter_readings', function (Blueprint $table) {
            $table->string('discount_segment', 100)->nullable()->after('discount_value');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_readings', function (Blueprint $table) {
            $table->dropColumn('discount_segment');
        });

        Schema::table('standing_discounts', function (Blueprint $table) {
            $table->dropColumn('segment');
        });
    }
};
