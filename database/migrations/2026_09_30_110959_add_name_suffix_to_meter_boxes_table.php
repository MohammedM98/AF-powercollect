<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table): void {
            $table->string('name_suffix', 50)->nullable();
            $table->unique(['name', 'name_suffix']);
        });
    }

    public function down(): void
    {
        Schema::table('meter_boxes', function (Blueprint $table): void {
            $table->dropUnique(['name', 'name_suffix']);
            $table->dropColumn('name_suffix');
        });
    }
};
