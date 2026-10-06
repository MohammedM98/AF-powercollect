<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The bank listed as "البنك الوطني الإسلامي" is البنك الإسلامي العربي: payments
 * already recorded under the old name take the right one, so they can still
 * be amended against the list of transfer banks.
 */
return new class extends Migration
{
    private const OLD_NAME = 'البنك الوطني الإسلامي';

    private const NEW_NAME = 'البنك الإسلامي العربي';

    public function up(): void
    {
        foreach (['bank_name', 'sender_bank_name'] as $column) {
            DB::table('subscriber_transactions')->where($column, self::OLD_NAME)->update([$column => self::NEW_NAME]);
        }
    }

    public function down(): void
    {
        foreach (['bank_name', 'sender_bank_name'] as $column) {
            DB::table('subscriber_transactions')->where($column, self::NEW_NAME)->update([$column => self::OLD_NAME]);
        }
    }
};
