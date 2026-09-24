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
        Schema::create('meter_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscriber_id')->constrained()->restrictOnDelete();
            $table->foreignId('branch_id')->constrained();
            $table->date('week_start');
            $table->date('week_end');
            $table->unsignedInteger('previous_reading');
            $table->unsignedInteger('current_reading');
            $table->unsignedInteger('consumption');
            $table->string('status')->default('pending');
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['subscriber_id', 'week_start']);
            $table->index(['branch_id', 'week_start']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('meter_readings');
    }
};
