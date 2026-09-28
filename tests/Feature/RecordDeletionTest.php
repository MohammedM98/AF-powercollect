<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Area;
use App\Models\Branch;
use App\Models\Governorate;
use App\Models\MeterBox;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\Tariff;
use App\Models\TariffSegment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RecordDeletionTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::factory()->create();
        $this->superAdmin = User::factory()->superAdmin()->create(['name' => 'Sami']);
    }

    public function test_a_subscriber_added_by_mistake_is_deleted_with_their_subscription_fee(): void
    {
        $subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Ahmad']);
        SubscriberTransaction::factory()->for($subscriber)->create();

        $this->deleteAs($this->superAdmin, route('subscribers.destroy', $subscriber))
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'subscriber-deleted')
            ->assertRedirect(route('subscribers.index'));

        $this->assertModelMissing($subscriber);
        $this->assertDatabaseCount('subscriber_transactions', 0);
        $this->assertSame(['action' => 'subscriber-deleted', 'subject' => 'Ahmad'], $this->superAdmin->notifications()->sole()->data);
    }

    public function test_a_subscriber_with_payments_is_kept_and_the_user_is_told_why(): void
    {
        $subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
        SubscriberTransaction::factory()->for($subscriber)->create();
        SubscriberTransaction::recordPayment($subscriber, $this->superAdmin, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->deleteAs($this->superAdmin, route('subscribers.destroy', $subscriber))
            ->assertSessionHasErrors(['delete' => 'لا يمكن حذف المشترك لوجود سجلات مرتبطة به — الحركات المالية: 1. يمكنك تغيير حالته إلى «مفصول» بدلًا من حذفه.']);

        $this->assertModelExists($subscriber);
        $this->assertDatabaseCount('subscriber_transactions', 2);
    }

    public function test_deleting_takes_the_delete_permission_within_the_users_own_branch(): void
    {
        $subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);
        $otherBranchAdmin = User::factory()->branchAdmin()->create();
        $otherBranchAdmin->permissions()->attach(Permission::idsFor([PermissionKey::DeleteSubscribers]));

        $this->deleteAs($branchAdmin, route('subscribers.destroy', $subscriber))->assertForbidden();
        $this->deleteAs($otherBranchAdmin, route('subscribers.destroy', $subscriber))->assertForbidden();

        $branchAdmin->permissions()->attach(Permission::idsFor([PermissionKey::DeleteSubscribers]));
        $this->actingAs($branchAdmin->fresh())
            ->get(route('subscribers.index'))
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.canDelete', true));
        $this->deleteAs($branchAdmin->fresh(), route('subscribers.destroy', $subscriber))->assertSessionHasNoErrors();
        $this->assertModelMissing($subscriber);
    }

    public function test_an_unused_user_account_is_deleted_and_signed_out(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        DB::table('sessions')->insert(['id' => 'abc', 'user_id' => $collector->id, 'payload' => '', 'last_activity' => now()->timestamp]);

        $this->deleteAs($this->superAdmin, route('users.destroy', $collector))
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'user-deleted');

        $this->assertModelMissing($collector);
        $this->assertDatabaseMissing('sessions', ['id' => 'abc']);
        $this->assertDatabaseMissing('permission_user', ['user_id' => $collector->id]);
    }

    public function test_a_user_who_recorded_work_is_kept_and_nobody_deletes_their_own_account(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        Subscriber::factory()->create(['branch_id' => $this->branch->id, 'registered_by' => $collector->id]);

        $this->deleteAs($this->superAdmin, route('users.destroy', $collector))
            ->assertSessionHasErrors(['delete' => 'لا يمكن حذف المستخدم لوجود سجلات مرتبطة به — المشتركون المسجّلون: 1. يمكنك إيقاف حسابه بدلًا من حذفه.']);
        $this->deleteAs($this->superAdmin, route('users.destroy', $this->superAdmin))->assertForbidden();

        $this->assertModelExists($collector);
    }

    public function test_a_tariff_or_segment_in_use_is_kept_and_an_unused_one_is_deleted(): void
    {
        $tariff = Tariff::factory()->create();
        $segment = TariffSegment::factory()->create(['tariff_id' => $tariff->id]);
        Subscriber::factory()->create(['tariff_id' => $tariff->id, 'tariff_segment_id' => $segment->id]);
        $unusedSegment = TariffSegment::factory()->create(['tariff_id' => $tariff->id]);

        $this->deleteAs($this->superAdmin, route('tariffs.destroy', $tariff))
            ->assertSessionHasErrors(['delete' => 'لا يمكن حذف التعرفة لوجود سجلات مرتبطة به — المشتركون: 1 · تصنيفات الزبائن: 2.']);
        $this->deleteAs($this->superAdmin, route('tariff-segments.destroy', $segment))->assertSessionHasErrors('delete');
        $this->deleteAs($this->superAdmin, route('tariff-segments.destroy', $unusedSegment))
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'tariff-segment-deleted');

        $this->assertModelExists($tariff);
        $this->assertModelExists($segment);
        $this->assertModelMissing($unusedSegment);
    }

    public function test_places_are_deleted_only_once_nothing_is_under_them(): void
    {
        $governorate = Governorate::factory()->create();
        $area = Area::factory()->create(['governorate_id' => $governorate->id]);
        $meterBox = MeterBox::factory()->create(['branch_id' => $this->branch->id]);

        $this->deleteAs($this->superAdmin, route('governorates.destroy', $governorate))->assertSessionHasErrors('delete');
        $this->deleteAs($this->superAdmin, route('branches.destroy', $this->branch))->assertSessionHasErrors('delete');
        $this->deleteAs($this->superAdmin, route('meter-boxes.destroy', $meterBox))->assertSessionHasNoErrors();
        $this->deleteAs($this->superAdmin, route('areas.destroy', $area))->assertSessionHasNoErrors();
        $this->deleteAs($this->superAdmin, route('governorates.destroy', $governorate))->assertSessionHasNoErrors();

        $this->assertModelMissing($meterBox);
        $this->assertModelMissing($area);
        $this->assertModelMissing($governorate);
        $this->assertModelExists($this->branch);
    }

    private function deleteAs(User $user, string $uri): TestResponse
    {
        return $this->actingAs($user)->from(route('subscribers.index'))->delete($uri);
    }
}
