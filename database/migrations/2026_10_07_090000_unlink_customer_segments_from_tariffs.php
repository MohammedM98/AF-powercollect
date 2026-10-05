<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Customer segments belong to no tariff any more: any subscriber can be
     * given any segment. Segments with the same name under different
     * tariffs become one, with all their subscribers.
     */
    public function up(): void
    {
        foreach (DB::table('tariff_segments')->orderBy('id')->get()->groupBy('name') as $sameName) {
            $kept = $sameName->first()->id;

            foreach ($sameName->skip(1) as $duplicate) {
                DB::table('subscribers')->where('tariff_segment_id', $duplicate->id)->update(['tariff_segment_id' => $kept]);
                DB::table('tariff_segments')->where('id', $duplicate->id)->delete();
            }
        }

        Schema::table('tariff_segments', function (Blueprint $table): void {
            $table->dropForeign(['tariff_id']);
        });
        Schema::table('tariff_segments', function (Blueprint $table): void {
            $table->dropUnique(['tariff_id', 'name']);
        });
        Schema::table('tariff_segments', function (Blueprint $table): void {
            $table->dropColumn('tariff_id');
        });
        Schema::table('tariff_segments', function (Blueprint $table): void {
            $table->unique('name');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Customer segments cannot be put back under their tariffs.');
    }
};
