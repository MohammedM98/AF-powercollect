<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Existing subscribers are numbered in registration order within the
     * year they were created, using the same format new ones get.
     */
    public function up(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->string('account_number', 20)->nullable()->unique()->after('id');
        });

        $sequenceByYear = [];

        DB::table('subscribers')->orderBy('id')->select(['id', 'created_at'])->each(function (object $subscriber) use (&$sequenceByYear): void {
            $year = $subscriber->created_at ? substr((string) $subscriber->created_at, 0, 4) : now()->format('Y');
            $sequenceByYear[$year] = ($sequenceByYear[$year] ?? 0) + 1;

            DB::table('subscribers')->where('id', $subscriber->id)->update([
                'account_number' => $year.str_pad((string) $sequenceByYear[$year], 5, '0', STR_PAD_LEFT),
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropUnique(['account_number']);
            $table->dropColumn('account_number');
        });
    }
};
