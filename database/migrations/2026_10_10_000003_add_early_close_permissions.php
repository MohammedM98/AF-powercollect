<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach (['closing.close_early' => 'Close the Week Early', 'closings.close_early' => 'Close the Day Early'] as $key => $label) {
            DB::table('permissions')->insertOrIgnore(['key' => $key, 'label' => $label, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')->whereIn('key', ['closing.close_early', 'closings.close_early'])->delete();
    }
};
