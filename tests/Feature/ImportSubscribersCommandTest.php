<?php

namespace Tests\Feature;

use App\Enums\AccountingType;
use App\Models\Area;
use App\Models\Branch;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\PendingCommand;
use Tests\TestCase;

class ImportSubscribersCommandTest extends TestCase
{
    use RefreshDatabase;

    private const HEADER = "subscription_number,name,phone_number,balance,subscription_type,minimum_limit,area\n";

    private Area $area;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->area = Area::factory()->create();
        $this->user = User::factory()->dataEntry()->create([
            'branch_id' => Branch::factory()->inArea($this->area)->create()->id,
        ]);
        Tariff::factory()->residential()->create();
    }

    private function csv(string $rows): string
    {
        $path = tempnam(sys_get_temp_dir(), 'import');
        file_put_contents($path, self::HEADER.$rows);

        return $path;
    }

    private function import(string $rows, array $options = []): PendingCommand
    {
        return $this->artisan('subscribers:import', ['file' => $this->csv($rows), '--user' => $this->user->username, ...$options]);
    }

    public function test_it_imports_subscribers_into_the_users_branch_with_their_balance_and_area(): void
    {
        $this->import("129600,اسامة فضل,0599013094,123.05,منزلي - أسبوعي,20,شواقفة حارة الشافعي\n129608,جهاد رائد,0599833619,-0.10,منزلي - أسبوعي,20,\n129620,وديع احمد,0592015201,0,منزلي - أسبوعي,60,شواقفة حارة الشافعي\n")
            ->assertSuccessful();

        $first = Subscriber::query()->where('legacy_number', '129600')->sole();
        $this->assertSame($this->user->branch_id, $first->branch_id);
        $this->assertSame($this->user->id, $first->registered_by);
        $this->assertSame('0599013094', $first->phone);
        $this->assertEquals(20, $first->minimum_charge);
        $this->assertSame(123.05, $first->balance());
        $this->assertSame($this->area->id, $first->meterBox->subArea->area_id);
        $this->assertSame('شواقفة حارة الشافعي', $first->meterBox->subArea->name);
        $this->assertSame('129600', $first->meterBox->box_number);
        $this->assertSame(AccountingType::Weekly, $first->accounting_type);

        $credit = Subscriber::query()->where('legacy_number', '129608')->sole();
        $this->assertSame(-0.10, $credit->balance());
        $this->assertNull($credit->meterBox->sub_area_id);

        $this->assertSame(0, Subscriber::query()->where('legacy_number', '129620')->sole()->transactions()->count());
        $this->assertSame(1, SubArea::query()->count());
    }

    public function test_a_monthly_subscription_type_sets_the_accounting_type_and_weekly_is_the_default(): void
    {
        $this->import("129600,اسامة,0599013094,10,منزلي - شهري,20,\n129601,محمد,0592674067,5,منزلي,20,\n")->assertSuccessful();

        $this->assertSame(AccountingType::Monthly, Subscriber::query()->where('legacy_number', '129600')->sole()->accounting_type);
        $this->assertSame(AccountingType::Weekly, Subscriber::query()->where('legacy_number', '129601')->sole()->accounting_type);
    }

    public function test_running_the_same_file_again_does_not_duplicate_anything(): void
    {
        $rows = "129600,اسامة فضل,0599013094,123.05,منزلي - أسبوعي,20,درويش\n";
        $this->import($rows)->assertSuccessful();

        $this->import($rows)->expectsOutputToContain('already imported 1')->assertSuccessful();

        $this->assertSame(1, Subscriber::query()->count());
        $this->assertSame(123.05, Subscriber::sole()->balance());
    }

    public function test_a_bad_row_is_reported_and_the_others_are_still_imported(): void
    {
        $this->import("129600,اسامة,0599013094,10,نوع غريب,20,درويش\n129601,محمد,0592674067,5,منزلي - أسبوعي,20,درويش\n")
            ->expectsOutputToContain('Line 2 (129600)')
            ->assertFailed();

        $this->assertSame(['129601'], Subscriber::query()->pluck('legacy_number')->all());
    }

    public function test_a_number_used_twice_in_the_file_fails_the_second_row_only(): void
    {
        $this->import("129600,اسامة,0599013094,10,منزلي - أسبوعي,20,\n129600,محمد,0592674067,5,منزلي - أسبوعي,20,\n")
            ->expectsOutputToContain('Line 3 (129600): The subscription number is already used on line 2.')
            ->assertFailed();

        $this->assertSame(['اسامة'], Subscriber::query()->pluck('full_name')->all());
    }

    public function test_a_sub_area_that_belongs_to_another_area_fails_that_row(): void
    {
        SubArea::factory()->create(['name' => 'درويش', 'area_id' => Area::factory()->create()->id]);

        $this->import("129600,اسامة,0599013094,10,منزلي - أسبوعي,20,درويش\n")->assertFailed();

        $this->assertSame(0, Subscriber::query()->count());
    }

    public function test_a_dry_run_saves_nothing(): void
    {
        $this->import("129600,اسامة,0599013094,10,منزلي - أسبوعي,20,درويش\n", ['--dry-run' => true])
            ->expectsOutputToContain('Checked 1')
            ->assertSuccessful();

        $this->assertSame(0, Subscriber::query()->count());
    }

    public function test_it_needs_a_user_whose_branch_has_an_area(): void
    {
        $this->user->branch->update(['area_id' => null]);

        $this->import("129600,اسامة,0599013094,10,منزلي - أسبوعي,20,درويش\n")->assertFailed();

        $this->assertSame(0, Subscriber::query()->count());
    }
}
