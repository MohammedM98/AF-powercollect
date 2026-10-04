<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('subscriber_transactions', 'active_reference')) {
            Schema::table('subscriber_transactions', function (Blueprint $table) {
                $table->string('active_reference', 100)->nullable()->after('reference_number');
            });
        }

        DB::table('subscriber_transactions')
            ->where('type', 'payment')
            ->whereNull('cancelled_at')
            ->whereNotNull('reference_number')
            ->orderBy('id')
            ->eachById(function (object $transaction): void {
                $normalized = Str::upper((string) preg_replace('/\s+/u', '', trim($transaction->reference_number)));

                DB::table('subscriber_transactions')->where('id', $transaction->id)->update([
                    'active_reference' => $normalized !== '' ? $normalized : null,
                ]);
            });

        DB::table('subscriber_transactions')
            ->select('active_reference')
            ->whereNotNull('active_reference')
            ->groupBy('active_reference')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('active_reference')
            ->each(function (string $activeReference): void {
                $canonicalTransactionId = DB::table('subscriber_transactions')
                    ->where('active_reference', $activeReference)
                    ->orderBy('id')
                    ->value('id');

                DB::table('subscriber_transactions')
                    ->where('active_reference', $activeReference)
                    ->where('id', '!=', $canonicalTransactionId)
                    ->update(['active_reference' => null]);
            });

        if (! Schema::hasIndex('subscriber_transactions', ['active_reference'], 'unique')) {
            Schema::table('subscriber_transactions', function (Blueprint $table) {
                $table->unique('active_reference');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropUnique(['active_reference']);
            $table->dropColumn('active_reference');
        });
    }
};
