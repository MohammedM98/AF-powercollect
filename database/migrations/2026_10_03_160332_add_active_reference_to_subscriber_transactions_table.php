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
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->string('active_reference', 100)->nullable()->after('reference_number');
        });

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

        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->unique('active_reference');
        });
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
