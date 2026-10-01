<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Each person gets one subscriber number, shared by all their
     * subscriptions. Existing people are numbered in the order they were
     * added.
     */
    public function up(): void
    {
        Schema::table('subscriber_profiles', function (Blueprint $table): void {
            $table->unsignedInteger('subscriber_number')->nullable()->unique()->after('id');
        });

        $nextNumber = 1;

        DB::table('subscriber_profiles')->orderBy('id')->chunkById(200, function ($profiles) use (&$nextNumber): void {
            foreach ($profiles as $profile) {
                DB::table('subscriber_profiles')->where('id', $profile->id)->update(['subscriber_number' => $nextNumber++]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('subscriber_profiles', function (Blueprint $table): void {
            $table->dropUnique(['subscriber_number']);
            $table->dropColumn('subscriber_number');
        });
    }
};
