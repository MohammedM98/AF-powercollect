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
            $table->dropConstrainedForeignId('area_1_id');
            $table->dropConstrainedForeignId('area_2_id');
            $table->dropColumn([
                'address',
                'billing_type',
                'unit_price',
                'minimum_charge',
                'customer_classification',
                'charge_subscription_fee',
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->text('address')->nullable();
            $table->string('billing_type')->nullable();
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->decimal('minimum_charge', 10, 2)->nullable();
            $table->foreignId('area_1_id')->nullable()->constrained('areas')->nullOnDelete();
            $table->foreignId('area_2_id')->nullable()->constrained('areas')->nullOnDelete();
            $table->string('customer_classification')->nullable();
            $table->boolean('charge_subscription_fee')->default(true);
        });
    }
};
