<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('circuit_breakers', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('ampere')->unique();
            $table->decimal('minimum_payment', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('circuit_breakers');
    }
};
