<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Undo 2026_10_06_100000: tariffs are the two fixed categories again
     * (منزلي and تجاري), and every tariff named «منزلي — x» or «تجاري — x»
     * goes back to being the customer segment «x» of that category, with
     * its subscribers. Any other tariff cannot be a category or a segment,
     * so it must be deleted (or renamed that way) first.
     */
    public function up(): void
    {
        // Nothing to restore where the tariffs were never renamed.
        if (! Schema::hasColumn('tariffs', 'name')) {
            return;
        }

        $categories = ['منزلي' => 'residential', 'تجاري' => 'commercial'];
        $segments = [];
        $others = [];

        foreach (DB::table('tariffs')->orderBy('id')->get() as $tariff) {
            if (isset($categories[$tariff->name])) {
                continue;
            }

            $parent = collect(array_keys($categories))->first(fn (string $name): bool => str_starts_with($tariff->name, $name.' — '));

            if ($parent === null) {
                $others[] = $tariff->name;
            } else {
                $segments[] = [$tariff, $parent, trim(substr($tariff->name, strlen($parent.' — ')))];
            }
        }

        if ($others !== []) {
            throw new RuntimeException('These tariffs are neither منزلي, تجاري nor «منزلي — …» / «تجاري — …»; delete or rename them first: '.implode('، ', $others));
        }

        // A segment needs the tariff it goes back under.
        foreach (collect($segments)->pluck(1)->unique() as $name) {
            if (! DB::table('tariffs')->where('name', $name)->exists()) {
                throw new RuntimeException("The tariff «{$name}» is missing; add it first.");
            }
        }

        Schema::create('tariff_segments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tariff_id')->constrained();
            $table->string('name');
            $table->timestamps();

            $table->unique(['tariff_id', 'name']);
        });
        Schema::table('subscribers', function (Blueprint $table): void {
            $table->foreignId('tariff_segment_id')->nullable()->after('tariff_id')->constrained()->nullOnDelete();
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->string('category')->nullable()->after('id');
        });

        foreach ($categories as $name => $category) {
            DB::table('tariffs')->where('name', $name)->update(['category' => $category]);
        }

        foreach ($segments as [$tariff, $parent, $segmentName]) {
            $parentId = DB::table('tariffs')->where('name', $parent)->value('id');
            $segmentId = DB::table('tariff_segments')->insertGetId([
                'tariff_id' => $parentId,
                'name' => $segmentName,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('subscribers')->where('tariff_id', $tariff->id)->update(['tariff_id' => $parentId, 'tariff_segment_id' => $segmentId]);
            DB::table('tariff_rate_changes')->where('tariff_id', $tariff->id)->delete();
            DB::table('tariffs')->where('id', $tariff->id)->delete();
        }

        Schema::table('tariffs', function (Blueprint $table): void {
            $table->dropUnique(['name']);
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->dropColumn('name');
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->string('category')->nullable(false)->change();
        });
        Schema::table('tariffs', function (Blueprint $table): void {
            $table->unique('category');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('This migration cannot be reversed.');
    }
};
