<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The standing discount a reading was recorded with, copied from the
     * subscriber like its prices so a later change never alters an old
     * week, and what it took off the week's bill.
     */
    public function up(): void
    {
        Schema::table('meter_readings', function (Blueprint $table) {
            $table->string('discount_method')->nullable()->after('minimum_payment');
            $table->decimal('discount_value', 12, 2)->nullable()->after('discount_method');
            $table->decimal('discount_amount', 10, 2)->default(0)->after('discount_value');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_readings', function (Blueprint $table) {
            $table->dropColumn(['discount_method', 'discount_value', 'discount_amount']);
        });
    }
};
