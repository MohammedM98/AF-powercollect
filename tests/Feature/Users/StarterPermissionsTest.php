<?php

namespace Tests\Feature\Users;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\MobileAccessToken;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class StarterPermissionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_collector_can_take_a_payment_in_the_app_without_anyone_ticking_anything(): void
    {
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector));
        $this->getJson(route('mobile.collections.subscriptions'))->assertOk();
        $this->postJson(route('mobile.collections.store'), [
            'mobile_operation_id' => Str::uuid()->toString(),
            'subscription_id' => $subscription->id,
            'amount' => '25.00',
            'currency' => 'ILS',
            'payment_method' => 'cash',
            'collector_confirmed' => true,
        ])->assertCreated()->assertJsonPath('status', 'recorded');
    }

    public function test_a_new_collector_holds_only_the_permission_to_take_payments(): void
    {
        $collector = User::factory()->collector()->create();

        $this->assertSame([PermissionKey::RecordCollections->value], $collector->permissions()->pluck('key')->all());
        $this->assertFalse($collector->hasPermission(PermissionKey::ViewCollections));
        $this->actingAs($collector)->get(route('ledger.index'))->assertForbidden();
    }

    public function test_a_new_financial_auditor_can_approve_a_closing_and_receive_cash(): void
    {
        $auditor = User::factory()->financialAuditor()->create();
        $closing = Closing::factory()->submitted()->create(['prepared_by' => User::factory()->accountant()->create()->id]);

        $this->actingAs($auditor)->post(route('closings.approve', $closing))->assertSessionHasNoErrors();

        $this->assertSame('approved', $closing->fresh()->status->value);
        $this->assertTrue($auditor->hasPermission(PermissionKey::AuditClosings));
        $this->assertTrue($auditor->hasPermission(PermissionKey::ViewAllClosings));
    }

    public function test_an_auditor_added_by_a_branch_admin_does_not_get_what_only_the_company_grants(): void
    {
        $branch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);

        $this->actingAs($branchAdmin)->post(route('users.store'), [
            'name' => 'New Auditor', 'username' => 'new.auditor', 'password' => 'Tulip2026ab', 'password_confirmation' => 'Tulip2026ab',
            'role' => UserRole::FinancialAuditor->value,
        ])->assertSessionHasNoErrors();

        $auditor = User::where('username', 'new.auditor')->sole();
        $this->assertFalse($auditor->hasPermission(PermissionKey::AuditClosings));
        $this->assertFalse($auditor->hasPermission(PermissionKey::ViewAllClosings));
    }
}
