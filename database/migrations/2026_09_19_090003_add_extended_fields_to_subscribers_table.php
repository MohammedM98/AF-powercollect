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
        Schema::table('subscribers', function (Blueprint $table) {
            $table->string('billing_type')->nullable()->after('tariff_id');
            $table->decimal('unit_price', 10, 2)->nullable()->after('billing_type');
            $table->decimal('minimum_charge', 10, 2)->nullable()->after('unit_price');
            $table->unsignedInteger('ampere_count')->nullable()->after('minimum_charge');
            $table->string('area_1')->nullable()->after('address');
            $table->string('area_2')->nullable()->after('area_1');
            $table->string('customer_classification')->nullable()->after('area_2');
            $table->unsignedInteger('previous_reading')->nullable()->after('customer_classification');
            $table->decimal('subscription_fee', 10, 2)->nullable()->after('previous_reading');
            $table->date('subscription_date')->nullable()->after('subscription_fee');
            $table->boolean('charge_subscription_fee')->default(true)->after('subscription_date');
            $table->text('notes')->nullable()->after('charge_subscription_fee');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropColumn([
                'billing_type',
                'unit_price',
                'minimum_charge',
                'ampere_count',
                'area_1',
                'area_2',
                'customer_classification',
                'previous_reading',
                'subscription_fee',
                'subscription_date',
                'charge_subscription_fee',
                'notes',
            ]);
        });
    }
};
