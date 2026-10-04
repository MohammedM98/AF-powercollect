<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('subscriber_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->nullable()->after('recorded_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('reference_transaction_id')->nullable()->after('corrects_id')->constrained('subscriber_transactions')->restrictOnDelete();
            $table->string('status')->default('active')->after('type');
            $table->decimal('balance_after', 12, 2)->nullable()->after('amount');
            $table->index(['subscriber_id', 'created_at', 'id'], 'subscriber_transactions_history_order_index');
        });

        $branchIds = DB::table('subscribers')->pluck('branch_id', 'id');
        $balances = [];

        DB::table('subscriber_transactions')
            ->select(['id', 'subscriber_id', 'recorded_by', 'reverses_id', 'amount', 'cancelled_at'])
            ->orderBy('subscriber_id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->each(function (object $transaction) use (&$balances, $branchIds): void {
                $subscriberId = (int) $transaction->subscriber_id;
                $balances[$subscriberId] = round(($balances[$subscriberId] ?? 0) + (float) $transaction->amount, 2);

                DB::table('subscriber_transactions')->where('id', $transaction->id)->update([
                    'branch_id' => $branchIds[$subscriberId] ?? null,
                    'employee_id' => $transaction->recorded_by,
                    'reference_transaction_id' => $transaction->reverses_id,
                    'status' => $transaction->cancelled_at === null ? 'active' : 'cancelled',
                    'balance_after' => number_format($balances[$subscriberId], 2, '.', ''),
                ]);
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropIndex('subscriber_transactions_history_order_index');
            $table->dropConstrainedForeignId('reference_transaction_id');
            $table->dropConstrainedForeignId('employee_id');
            $table->dropConstrainedForeignId('branch_id');
            $table->dropColumn(['status', 'balance_after']);
        });
    }
};
