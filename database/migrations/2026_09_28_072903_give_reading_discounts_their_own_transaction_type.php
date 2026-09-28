<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A weekly reading's standing discount is now a type of line of its own
     * (خصم قراءة أسبوعية). Those approved so far were recorded as discounts
     * tied to their reading; discounts given by hand have no reading.
     */
    public function up(): void
    {
        DB::table('subscriber_transactions')
            ->where('type', 'discount')
            ->whereNotNull('meter_reading_id')
            ->update(['type' => 'reading_discount']);
    }

    /**
     * Back to discounts tied to their reading.
     */
    public function down(): void
    {
        DB::table('subscriber_transactions')
            ->where('type', 'reading_discount')
            ->update(['type' => 'discount']);
    }
};
