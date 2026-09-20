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
            $table->dropColumn(['area_1', 'area_2']);
            $table->foreignId('area_1_id')->nullable()->after('ampere_count')->constrained('areas')->nullOnDelete();
            $table->foreignId('area_2_id')->nullable()->after('area_1_id')->constrained('areas')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('area_1_id');
            $table->dropConstrainedForeignId('area_2_id');
            $table->string('area_1')->nullable();
            $table->string('area_2')->nullable();
        });
    }
};
