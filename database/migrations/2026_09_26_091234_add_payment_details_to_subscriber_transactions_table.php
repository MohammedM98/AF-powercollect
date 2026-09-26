<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Turn the transactions into a full account ledger: payments, with the
     * currency and rate they were taken in and how they were paid, next to
     * the charges. `amount` stays the effect on the balance in shekels
     * (charges add, payments subtract); `currency_amount` is what was
     * actually handed over, in `currency`.
     */
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->foreignId('meter_reading_id')->nullable()->after('recorded_by')->constrained()->nullOnDelete();
            $table->string('currency', 3)->default('ILS')->after('amount');
            $table->decimal('currency_amount', 12, 2)->nullable()->after('currency');
            $table->decimal('exchange_rate', 12, 4)->default(1)->after('currency_amount');
            $table->string('payment_method')->nullable()->after('exchange_rate');
            $table->string('bank_name')->nullable()->after('payment_method');
            $table->string('reference_number')->nullable()->after('bank_name');
            $table->unsignedInteger('voucher_number')->nullable()->unique()->after('reference_number');
            $table->string('manual_voucher_number')->nullable()->after('voucher_number');
            $table->string('cash_box')->nullable()->after('manual_voucher_number');
            $table->text('notes')->nullable()->after('cash_box');
        });

        DB::table('subscriber_transactions')->update(['currency_amount' => DB::raw('amount')]);

        DB::table('subscriber_transactions')
            ->where('type', 'meter_reading')
            ->orderBy('id')
            ->each(function (object $transaction): void {
                $readingId = (int) str($transaction->source_key)->after('meter-reading:')->toString();

                if (DB::table('meter_readings')->where('id', $readingId)->exists()) {
                    DB::table('subscriber_transactions')->where('id', $transaction->id)->update(['meter_reading_id' => $readingId]);
                }
            });
    }

    /**
     * Reverse the migrations. Payments can't be kept without their
     * details, so they go too.
     */
    public function down(): void
    {
        DB::table('subscriber_transactions')->where('type', 'payment')->delete();

        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('meter_reading_id');
            $table->dropUnique(['voucher_number']);
            $table->dropColumn([
                'currency',
                'currency_amount',
                'exchange_rate',
                'payment_method',
                'bank_name',
                'reference_number',
                'voucher_number',
                'manual_voucher_number',
                'cash_box',
                'notes',
            ]);
        });
    }
};
