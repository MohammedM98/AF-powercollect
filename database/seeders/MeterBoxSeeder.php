<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\SubArea;
use Illuminate\Database\Seeder;
use RuntimeException;

class MeterBoxSeeder extends Seeder
{
    /**
     * The area the boxes are in, and so the one whose branch they go to.
     */
    private const AREA = 'مخيم 2';

    /**
     * Seed the meter boxes from `data/meter_boxes.json` — each as
     * `[name, suffix, box number, location, منطقة 2]` — under their منطقة 2
     * where the name tells which one. Safe to run again: a box already
     * seeded is kept. A box whose number, or name and suffix, is already
     * used by a different box is skipped and listed.
     */
    public function run(): void
    {
        $this->call(LocationSeeder::class);

        $branch = $this->branch();
        $subAreaIds = SubArea::query()->pluck('id', 'name');
        $boxes = json_decode((string) file_get_contents(__DIR__.'/data/meter_boxes.json'), true, 512, JSON_THROW_ON_ERROR);
        $created = 0;
        $skipped = [];

        foreach ($boxes as [$name, $suffix, $boxNumber, $location, $subAreaName]) {
            $sameNumber = MeterBox::query()->where('box_number', $boxNumber)->first();
            // A name without a suffix may repeat; the pair may not.
            $sameName = $suffix !== null && MeterBox::query()
                ->when($name === null, fn ($query) => $query->whereNull('name'), fn ($query) => $query->where('name', $name))
                ->where('name_suffix', $suffix)
                ->exists();

            if ($sameNumber !== null) {
                if ($sameNumber->name !== $name || $sameNumber->name_suffix !== $suffix) {
                    $skipped[] = sprintf('%s %s (%s) — الرقم مستخدم لطبلون «%s»', $name, $suffix, $boxNumber, $sameNumber->displayName());
                }

                continue;
            }

            if ($sameName) {
                $skipped[] = sprintf('%s %s (%s) — الاسم مستخدم لطبلون آخر', $name, $suffix, $boxNumber);

                continue;
            }

            MeterBox::query()->create([
                'name' => $name,
                'name_suffix' => $suffix,
                'box_number' => $boxNumber,
                'branch_id' => $branch->id,
                'sub_area_id' => $subAreaName !== null ? ($subAreaIds[$subAreaName] ?? null) : null,
                'location' => $location,
            ]);
            $created++;
        }

        $this->command?->info("أُضيف {$created} طبلون.");

        foreach ($skipped as $line) {
            $this->command?->warn('تخطّي: '.$line);
        }
    }

    /**
     * The branch of the area — or the only branch there is.
     */
    private function branch(): Branch
    {
        $areaId = Area::query()->where('name', self::AREA)->value('id');
        $branches = Branch::query()->where('area_id', $areaId)->get();

        if ($branches->count() !== 1 && Branch::query()->count() === 1) {
            $branches = Branch::query()->get();
        }

        return $branches->count() === 1
            ? $branches->first()
            : throw new RuntimeException('لم أجد فرعًا واحدًا لمنطقة «'.self::AREA.'»؛ اربط الفرع بالمنطقة من الإعدادات ثم أعد التشغيل.');
    }
}
