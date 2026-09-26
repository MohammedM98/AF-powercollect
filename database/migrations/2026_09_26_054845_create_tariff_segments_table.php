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
        // A tariff's customer segments (e.g. mosques, schools under
        // Residential): labels for grouping subscribers, not separate prices.
        Schema::create('tariff_segments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tariff_id')->constrained();
            $table->string('name');
            $table->timestamps();

            $table->unique(['tariff_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tariff_segments');
    }
};
