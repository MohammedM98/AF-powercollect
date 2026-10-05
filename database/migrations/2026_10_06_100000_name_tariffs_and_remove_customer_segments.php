<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tariffs are named freely instead of being one of two fixed
     * categories, and each has its own kilo price. The customer segments
     * are removed: each becomes a tariff of its own, with its parent's
     * price, and its subscribers move to it.
     */
    public function up(): void
    {
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->string('name')->nullable()->after('id');
        });

        $names = ['residential' => 'منزلي', 'commercial' => 'تجاري'];

        foreach (DB::table('tariffs')->get() as $tariff) {
            DB::table('tariffs')->where('id', $tariff->id)->update(['name' => $names[$tariff->category] ?? $tariff->category]);
        }

        foreach (DB::table('tariff_segments')->orderBy('id')->get() as $segment) {
            $parent = DB::table('tariffs')->where('id', $segment->tariff_id)->first();
            $tariffId = DB::table('tariffs')->insertGetId([
                'name' => $parent->name.' — '.$segment->name,
                // Dropped below; only has to be unique until then.
                'category' => 'segment-'.$segment->id,
                'rate' => $parent->rate,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('tariff_rate_changes')->insert(['tariff_id' => $tariffId, 'rate' => $parent->rate, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('subscribers')->where('tariff_segment_id', $segment->id)->update(['tariff_id' => $tariffId]);
        }

        Schema::table('subscribers', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('tariff_segment_id');
        });
        Schema::drop('tariff_segments');

        Schema::table('tariffs', function (Blueprint $table): void {
            $table->dropUnique(['category']);
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->dropColumn('category');
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->string('name')->nullable(false)->change();
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->unique('name');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Customer segments cannot be restored from tariffs.');
    }
};
