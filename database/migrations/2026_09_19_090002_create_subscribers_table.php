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
            $table->string('full_name');
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('meter_number')->unique();

            // Nullable: a subscriber can be registered before a meter box is
            // assigned to them.
            $table->foreignId('meter_box_id')->nullable()->constrained('meter_boxes')->nullOnDelete();

            $table->foreignId('tariff_id')->constrained();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('registered_by')->constrained('users');
            $table->string('status')->default('active');
            $table->timestamps();
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
