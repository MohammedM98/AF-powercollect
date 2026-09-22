<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropColumn('ampere_count');
            $table->foreignId('circuit_breaker_id')->nullable()->after('billing_type')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('circuit_breaker_id');
            $table->unsignedInteger('ampere_count')->nullable();
        });
    }
};
