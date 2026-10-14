<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Each collector's confirmation of a weekly closing the branch closed,
     * owed before the branch sends the week to audit.
     */
    public function up(): void
    {
        Schema::create('closing_confirmations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('closing_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();
            $table->unique(['closing_id', 'user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('closing_confirmations');
    }
};
