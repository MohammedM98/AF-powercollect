<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Governorate;
use App\Models\SubArea;
use Illuminate\Database\Seeder;

class LocationSeeder extends Seeder
{
    /**
     * The service area: the governorate, its area (منطقة 1) and that area's
     * sub-areas (منطقة 2).
     *
     * @var array<string, array<string, array<int, string>>>
     */
    private const LOCATIONS = [
        'النصيرات' => [
            'مخيم 2' => [
                'مدارس جديد', 'الحاج', 'الابراج', 'ابو ذر', 'ابو هويشل', 'ابو رحمة', 'الفقي', 'الشافعي', 'ابو عمرة',
                'زهرة الربيع', 'مكتبة خالد', 'المدارس', 'الحملاوي', 'النادي الأهلي', 'أرض الحلو', 'ابراج (شارع الحسنات)',
                'ابراج (مسجد النور)', 'الابراج (شمال الابراج)', 'ابراج (جنوب الابراج)', 'شوافعة ابو بطيحان',
                'شوافعة ابو عبيدة', 'شوافعة شرقية', 'شوافعة حارة الشافعي', 'حميدة', 'دوار ابو انور', 'الخوالدة',
                'المقبرة', 'شمال المقبرة', 'درويش مدخل', 'درويش عاشور', 'درويش مسجد السنة', 'شوافعة الاهرام',
                'الشقاقي', 'دوار ريان', 'فنونة',
            ],
        ],
    ];

    /**
     * Seed the locations. Safe to run again: what already exists is kept.
     */
    public function run(): void
    {
        foreach (self::LOCATIONS as $governorateName => $areas) {
            $governorate = Governorate::firstOrCreate(['name' => $governorateName]);

            foreach ($areas as $areaName => $subAreaNames) {
                $area = Area::firstOrCreate(['name' => $areaName], ['governorate_id' => $governorate->id]);

                foreach ($subAreaNames as $subAreaName) {
                    SubArea::firstOrCreate(['name' => $subAreaName], ['area_id' => $area->id]);
                }
            }
        }
    }
}
