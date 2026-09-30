<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table): void {
            $table->string('sender_bank_name')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table): void {
            $table->dropColumn('sender_bank_name');
        });
    }
};
