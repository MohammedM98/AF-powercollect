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
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->dropColumn('area');
            $table->foreignId('area_id')->nullable()->after('branch_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('area_id');
            $table->string('area')->nullable();
        });
    }
};
