<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The kilowatt price and minimum payment are copied onto each reading
     * when it is recorded, so a later price change never alters an
     * already-recorded week.
     */
    public function up(): void
    {
        Schema::table('meter_readings', function (Blueprint $table) {
            $table->decimal('unit_price', 10, 2)->default(0)->after('consumption');
            $table->decimal('reading_fee', 10, 2)->default(0)->after('unit_price');
            $table->decimal('minimum_payment', 10, 2)->default(0)->after('reading_fee');
            $table->decimal('amount_due', 10, 2)->default(0)->after('minimum_payment');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_readings', function (Blueprint $table) {
            $table->dropColumn(['unit_price', 'reading_fee', 'minimum_payment', 'amount_due']);
        });
    }
};
