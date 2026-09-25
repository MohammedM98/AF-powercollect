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
        Schema::create('subscribers', function (Blueprint $table) {
            $table->id();

            // Nullable only so the row can be inserted first: the model
            // assigns the account number itself while creating.
            $table->string('account_number', 20)->nullable()->unique();

            $table->string('full_name');
            $table->string('national_id', 9)->nullable()->unique();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();

            $table->foreignId('branch_id')->constrained();

            // Nullable: a subscriber can be registered before a meter box is
            // assigned to them.
            $table->foreignId('meter_box_id')->nullable()->constrained()->nullOnDelete();

            $table->foreignId('tariff_id')->constrained();
            $table->foreignId('circuit_breaker_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('minimum_charge', 10, 2)->nullable();
            $table->unsignedInteger('initial_reading')->nullable();
            $table->decimal('subscription_fee', 10, 2)->nullable();
            $table->date('subscription_date')->nullable();

            $table->string('status')->default('active');
            $table->foreignId('registered_by')->constrained('users');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('subscribers');
    }
};
