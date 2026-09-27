<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * How a discount was given: by percentage, kilowatts or shekels, the
     * value entered, and what it was worked out from (the balance owed for
     * a percentage, the kilo price for kilowatts).
     */
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->string('discount_method')->nullable()->after('cash_box');
            $table->decimal('discount_value', 12, 2)->nullable()->after('discount_method');
            $table->decimal('discount_base', 12, 2)->nullable()->after('discount_value');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropColumn(['discount_method', 'discount_value', 'discount_base']);
        });
    }
};
