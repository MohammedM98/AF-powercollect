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
        foreach (['closing.close' => 'Close Weekly Periods', 'closing.mark_audited' => 'Mark Weekly Closings Audited', 'adjustment.create' => 'Correct Closed Transactions', 'reversal.create' => 'Reverse Closed Transactions'] as $key => $label) {
            DB::table('permissions')->insertOrIgnore(['key' => $key, 'label' => $label, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')->whereIn('key', ['closing.close', 'closing.mark_audited', 'adjustment.create', 'reversal.create'])->delete();
    }
};
