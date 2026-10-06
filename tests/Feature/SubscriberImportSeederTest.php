<?php

namespace Tests\Feature;

use App\Models\Subscriber;
use Database\Seeders\SubscriberImportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberImportSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_imports_the_old_system_subscribers_into_the_camp_2_branch(): void
    {
        $this->seed(SubscriberImportSeeder::class);

        // 160 rows; the second use of 133163 and of 133168 is left out.
        $this->assertSame(158, Subscriber::query()->count());
        $first = Subscriber::query()->where('legacy_number', '129600')->sole();
        $this->assertSame('اسامة فضل العثماني', $first->full_name);
        $this->assertSame(123.05, $first->balance());
        $this->assertSame('رشدي عليان سالم خطاب', Subscriber::query()->where('legacy_number', '133163')->sole()->full_name);
        $this->assertSame('monthly', Subscriber::query()->where('legacy_number', '140332')->sole()->accounting_type->value);
        $this->assertSame(1, Subscriber::query()->distinct()->count('branch_id'));

        $this->seed(SubscriberImportSeeder::class);

        $this->assertSame(158, Subscriber::query()->count());
    }
}
