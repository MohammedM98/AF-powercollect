<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What paid for what: how much of a payment or discount (the credit)
     * went towards a charge on the same account. A charge that is removed,
     * such as a reading sent back for review, frees what paid for it.
     */
    public function up(): void
    {
        Schema::create('transaction_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('credit_id')->constrained('subscriber_transactions')->cascadeOnDelete();
            $table->foreignId('charge_id')->constrained('subscriber_transactions')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('transaction_allocations');
    }
};
