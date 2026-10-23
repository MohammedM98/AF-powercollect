<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\MobileAccessToken;
use App\Models\Permission;
use App\Models\SubArea;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PageLoadingPerformanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_preloads_the_local_body_font_without_google_font_requests(): void
    {
        $this->get(route('login'))->assertSee('as="font"', false)
            ->assertSee('type="font/woff2"', false)
            ->assertDontSee('fonts.googleapis.com', false)
            ->assertDontSee('fonts.gstatic.com', false);
    }

    public function test_filtering_latest_payments_does_not_recompute_reading_summaries(): void
    {
        $actor = User::factory()->superAdmin()->create();
        $version = app(HandleInertiaRequests::class)->version(request());
        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->actingAs($actor)->getJson(route('dashboard'), [
            'X-Inertia' => 'true', 'X-Inertia-Version' => (string) $version,
            'X-Inertia-Partial-Component' => 'Dashboard',
            'X-Inertia-Partial-Data' => 'latestPayments,filters',
        ])->assertJsonPath('props.latestPayments.sum', 0)
            ->assertJsonMissingPath('props.sections');

        $summaryQueries = collect(DB::getQueryLog())->filter(fn (array $query): bool => str_contains($query['query'], 'from "meter_readings"'));
        DB::disableQueryLog();
        $this->assertCount(0, $summaryQueries);
    }

    public function test_subscription_search_does_not_fetch_form_options(): void
    {
        $actor = User::factory()->superAdmin()->create();
        Subscription::factory()->create(['full_name' => 'عميل البحث']);
        $version = app(HandleInertiaRequests::class)->version(request());
        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->actingAs($actor)->getJson(route('subscriptions.index', ['search' => 'لا يوجد']), [
            'X-Inertia' => 'true', 'X-Inertia-Version' => (string) $version,
            'X-Inertia-Partial-Component' => 'Subscriptions/Index',
            'X-Inertia-Partial-Data' => 'subscriptions,filters',
        ])->assertJsonPath('props.subscriptions.total', 0)
            ->assertJsonMissingPath('props.tariffs')
            ->assertJsonMissingPath('props.circuitBreakers');

        $optionQueries = collect(DB::getQueryLog())->filter(fn (array $query): bool => str_contains($query['query'], 'from "tariffs"') || str_contains($query['query'], 'from "circuit_breakers"'));
        DB::disableQueryLog();
        $this->assertCount(0, $optionQueries);
    }

    public function test_mobile_summary_supplies_personal_details_and_the_subscriber_sub_area(): void
    {
        $actor = User::factory()->create();
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscriptions]));
        $subscription = Subscription::factory()->create(['branch_id' => $actor->branch_id, 'full_name' => 'صاحب الحساب', 'subscription_name' => 'متجر الكهرباء', 'phone' => '0599000111', 'national_id' => '123456789']);
        $subArea = SubArea::factory()->create(['name' => 'الحي الشرقي']);
        $subscription->meterBox->update(['sub_area_id' => $subArea->id]);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($actor))
            ->getJson(route('mobile.collections.subscriptions.show', $subscription))
            ->assertJsonPath('subscription.subscriber_name', 'صاحب الحساب')
            ->assertJsonPath('subscription.subscription_name', 'متجر الكهرباء')
            ->assertJsonPath('subscription.national_id', '123456789')
            ->assertJsonPath('subscription.personal_phone', '0599000111')
            ->assertJsonPath('subscription.sub_area_name', 'الحي الشرقي');
    }
}
