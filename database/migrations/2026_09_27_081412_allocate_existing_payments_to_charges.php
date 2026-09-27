<?php

use App\Models\Subscriber;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Record what the payments and discounts made so far paid for: each
     * account's are set against its charges oldest first.
     */
    public function up(): void
    {
        Subscriber::query()->has('transactions')->each(fn (Subscriber $subscriber) => $subscriber->applyCredits());
    }

    /**
     * The table these records live in is dropped by the migration before.
     */
    public function down(): void
    {
        //
    }
};
