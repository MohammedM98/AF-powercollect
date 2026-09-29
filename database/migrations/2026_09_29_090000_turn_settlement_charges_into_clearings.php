<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A clearing (مقاصة) is a service the subscriber gave the company, so it
     * comes off what they owe rather than adding to it. Those entered so far
     * as settlement charges become clearings on the other side of the
     * account, and so do the reversals of any that were cancelled.
     */
    public function up(): void
    {
        $this->move('settlement', 'clearing');
    }

    /**
     * Back to settlement charges.
     */
    public function down(): void
    {
        $this->move('clearing', 'settlement');
    }

    /**
     * Give the lines of type `$from` the type `$to`, and move them and their
     * reversals to the other side of the account.
     */
    private function move(string $from, string $to): void
    {
        DB::transaction(function () use ($from, $to): void {
            $ids = DB::table('subscriber_transactions')->where('type', $from)->pluck('id');

            DB::table('subscriber_transactions')
                ->whereIn('id', $ids)
                ->orWhereIn('reverses_id', $ids)
                ->update(['amount' => DB::raw('-amount')]);

            DB::table('subscriber_transactions')->whereIn('id', $ids)->update(['type' => $to]);
        });
    }
};
