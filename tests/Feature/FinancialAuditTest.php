<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\FinancialAuditLine;
use App\Models\FinancialAuditStatement;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingAdjustmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class FinancialAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Hebron']);
        $this->travelTo(Carbon::parse('2026-09-28 09:00', 'Asia/Hebron'));
    }

    /** @return array{Branch, User, User, SubscriptionTransaction, Closing} */
    private function branchPayment(): array
    {
        $branch = Branch::factory()->create();
        $sender = User::factory()->accountant()->create(['branch_id' => $branch->id]);
        $auditor = User::factory()->financialAuditor()->withPermissions([PermissionKey::AuditClosings, PermissionKey::ViewAllClosings])->create(['branch_id' => Branch::factory()->create(['name' => 'التدقيق المركزي'])->id]);
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriptionTransaction::recordPayment($subscription, $sender, ['amount' => '100.00', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $closing = Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $branch->id, 'prepared_by' => $sender->id, 'counted_cash' => '100.00']);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));

        return [$branch, $sender, $auditor, $payment, $closing];
    }

    private function submit(Branch $branch, User $sender, string $type = 'daily'): FinancialAuditStatement
    {
        $this->actingAs($sender)->post(route('financial-audit.store'), ['branch_id' => $branch->id, 'type' => $type, 'date' => '2026-09-28'])->assertSessionHasNoErrors();

        return FinancialAuditStatement::query()->where('branch_id', $branch->id)->where('type', $type)->sole();
    }

    public function test_submission_and_manual_verification_preserve_every_existing_financial_transaction(): void
    {
        [$branch, $sender, $auditor, $payment] = $this->branchPayment();
        $before = SubscriptionTransaction::query()->orderBy('id')->get()->map->getRawOriginal()->all();
        $statement = $this->submit($branch, $sender);
        $line = $statement->lines()->sole();
        $this->get(route('closings.index', ['tab' => 'daily', 'branch' => $branch->id, 'date' => '2026-09-28']))
            ->assertInertia(fn ($page) => $page->where('daily.auditStatement.id', $statement->id)->where('daily.can.sendToAudit', false));
        $this->assertSame('100.00', $statement->snapshot['report']['actualCollectionTotal']);
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $line]), ['action' => 'confirm'])->assertSessionHasNoErrors();
        $this->post(route('financial-audit.approve', $statement), [])->assertSessionHasNoErrors();
        $this->assertSame('audited', $statement->fresh()->status);
        $this->assertSame($auditor->id, $statement->fresh()->reviewed_by);
        $this->assertSame($before, SubscriptionTransaction::query()->orderBy('id')->get()->map->getRawOriginal()->all());
        $this->assertSame('-100.00', $payment->fresh()->amount);
        $this->assertSame(['submitted', 'confirmed', 'audited'], $statement->events()->orderBy('id')->pluck('action')->all());
        $this->assertFalse($auditor->hasPermission(PermissionKey::RecordCollections));
        $this->assertFalse($auditor->hasPermission(PermissionKey::CorrectTransactions));
        $this->post(route('financial-audit.approve', $statement))->assertForbidden();
        $this->assertSame(3, $statement->events()->count());
    }

    public function test_returning_one_transaction_requires_a_response_and_reverification_without_reopening_the_closing(): void
    {
        [$branch, $sender, $auditor, $payment, $closing] = $this->branchPayment();
        $statement = $this->submit($branch, $sender);
        $line = $statement->lines()->sole();
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $line]), ['action' => 'return'])->assertSessionHasErrors('notes');
        $this->put(route('financial-audit.review', [$statement, $line]), ['action' => 'return', 'notes' => 'وضح مرجع الدفعة'])->assertSessionHasNoErrors();
        $this->post(route('financial-audit.approve', $statement))->assertSessionHasErrors('audit');
        $this->put(route('financial-audit.review', [$statement, $line]), ['action' => 'confirm'])->assertSessionHasErrors('audit');
        $this->actingAs($sender)->post(route('financial-audit.respond', [$statement, $line]), ['response' => 'المبلغ ورد في كشف الشركة بالمرجع المتاح للمدقق'])->assertSessionHasNoErrors();
        $this->assertSame('responded', $line->fresh()->status);
        $this->assertSame('approved', $closing->fresh()->status->value);
        $this->assertSame('-100.00', $payment->fresh()->amount);
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $line]), ['action' => 'confirm'])->assertSessionHasNoErrors();
        $this->post(route('financial-audit.approve', $statement))->assertSessionHasNoErrors();
        $this->assertSame(['submitted', 'returned', 'responded', 'confirmed', 'audited'], $statement->events()->orderBy('id')->pluck('action')->all());
    }

    public function test_a_return_does_not_reset_other_confirmed_transactions(): void
    {
        [$branch, $sender, $auditor, $payment] = $this->branchPayment();
        $this->travelTo(Carbon::parse('2026-09-28 10:00', 'Asia/Hebron'));
        SubscriptionTransaction::recordPayment($payment->subscription, $sender, ['amount' => '25.00', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
        $statement = $this->submit($branch, $sender);
        [$first, $second] = $statement->lines()->orderBy('id')->get()->all();
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $first]), ['action' => 'confirm'])->assertSessionHasNoErrors();
        $this->put(route('financial-audit.review', [$statement, $second]), ['action' => 'return', 'notes' => 'راجع مبلغ الحركة'])->assertSessionHasNoErrors();
        $this->assertSame('confirmed', $first->fresh()->status);
        $this->assertSame('returned', $second->fresh()->status);
        $this->assertSame('returned', $statement->fresh()->status);
    }

    public function test_central_auditors_see_all_branches_but_branch_staff_and_read_only_reviewers_cannot_mutate_other_statements(): void
    {
        [$branch, $sender, $auditor] = $this->branchPayment();
        $statement = $this->submit($branch, $sender);
        $line = $statement->lines()->sole();
        $this->actingAs($auditor)->get(route('financial-audit.index'))->assertOk()->assertInertia(fn ($page) => $page->where('statements.data.0.branchName', $branch->name));
        $this->get(route('financial-audit.show', $statement))->assertOk();
        $other = User::factory()->accountant()->create();
        $this->actingAs($other)->get(route('financial-audit.show', $statement))->assertNotFound();
        $this->post(route('financial-audit.respond', [$statement, $line]), ['response' => 'رد غير مخول'])->assertNotFound();
        $this->post(route('financial-audit.store'), ['branch_id' => $branch->id, 'type' => 'daily', 'date' => '2026-09-28'])->assertForbidden();
        $this->get(route('financial-audit.branch'))->assertInertia(fn ($page) => $page->has('statements.data', 0));
        $viewer = User::factory()->accountant()->withPermissions([PermissionKey::ViewAllClosings])->create();
        $this->actingAs($viewer)->get(route('financial-audit.show', $statement))->assertOk();
        $this->put(route('financial-audit.review', [$statement, $line]), ['action' => 'confirm'])->assertForbidden();
        $this->assertSame('pending', $line->fresh()->status);
    }

    public function test_branch_approval_is_separate_and_requires_a_different_preparer_in_the_same_branch(): void
    {
        $branch = Branch::factory()->create();
        $preparer = User::factory()->accountant()->create(['branch_id' => $branch->id]);
        $approver = User::factory()->accountant()->create(['branch_id' => $branch->id]);
        $foreign = User::factory()->accountant()->create();
        $closing = Closing::factory()->submitted()->create(['branch_id' => $branch->id, 'prepared_by' => $preparer->id]);
        $this->actingAs($preparer)->post(route('closings.branch-approve', $closing))->assertForbidden();
        $this->actingAs($foreign)->post(route('closings.branch-approve', $closing))->assertForbidden();
        $this->actingAs($approver)->post(route('closings.branch-approve', $closing))->assertSessionHasNoErrors();
        $this->assertSame('approved', $closing->fresh()->status->value);
        $this->assertSame($approver->id, $closing->fresh()->reviewed_by);
        $this->assertDatabaseCount('financial_audit_statements', 0);
    }

    public function test_draft_statements_and_duplicate_submissions_cannot_enter_the_audit_inbox(): void
    {
        [$branch, $sender, , , $closing] = $this->branchPayment();
        $closing->update(['status' => 'draft']);
        $this->actingAs($sender)->post(route('financial-audit.store'), ['branch_id' => $branch->id, 'type' => 'daily', 'date' => '2026-09-28'])->assertSessionHasErrors('audit');
        $this->assertDatabaseCount('financial_audit_statements', 0);
        $closing->update(['status' => 'approved']);
        $this->submit($branch, $sender);
        $this->post(route('financial-audit.store'), ['branch_id' => $branch->id, 'type' => 'daily', 'date' => '2026-09-28'])->assertSessionHasErrors('audit');
        $this->assertDatabaseCount('financial_audit_statements', 1);
        $this->assertDatabaseCount('financial_audit_events', 1);
    }

    public function test_the_sender_cannot_audit_their_own_statement_and_foreign_lines_cannot_be_reviewed(): void
    {
        [$branch, $sender, $auditor] = $this->branchPayment();
        $statement = $this->submit($branch, $sender);
        $sender->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings, PermissionKey::AuditClosings]));
        $sender->unsetRelation('permissions');
        $this->actingAs($sender)->put(route('financial-audit.review', [$statement, $statement->lines()->sole()]), ['action' => 'confirm'])->assertForbidden();
        $foreign = FinancialAuditLine::factory()->create();
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $foreign]), ['action' => 'confirm'])->assertNotFound();
        $this->assertSame('pending', $foreign->fresh()->status);
    }

    #[TestWith(['weekly'])]
    #[TestWith(['monthly'])]
    public function test_period_statements_reuse_existing_payments_without_duplicating_financial_entries(string $type): void
    {
        [$branch, $sender, , $payment] = $this->branchPayment();
        if ($type === 'weekly') {
            $this->actingAs(User::factory()->superAdmin()->create())->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();
        }
        $count = SubscriptionTransaction::count();
        $statement = $this->submit($branch, $sender, $type);
        $this->assertSame('100.00', $statement->snapshot['report']['actualCollectionTotal']);
        $this->assertSame($payment->id, $statement->lines()->sole()->subscription_transaction_id);
        $this->assertSame($count, SubscriptionTransaction::count());
    }

    public function test_a_closed_week_correction_can_be_linked_without_rewriting_the_original_statement(): void
    {
        [$branch, $sender, $auditor, $payment] = $this->branchPayment();
        $admin = User::factory()->superAdmin()->create();
        $this->actingAs($admin)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();
        $statement = $this->submit($branch, $sender, 'weekly');
        $snapshot = $statement->snapshot;
        $line = $statement->lines()->sole();
        $this->actingAs($auditor)->put(route('financial-audit.review', [$statement, $line]), ['action' => 'return', 'notes' => 'صحح خطأ المبلغ'])->assertSessionHasNoErrors();
        $correction = app(ClosingAdjustmentService::class)->adjust($payment, $admin, 'correction', '80.00', 'تصحيح موثق بعد إقفال الأسبوع');
        $this->actingAs($sender)->post(route('financial-audit.respond', [$statement, $line]), ['response' => 'سجلنا تصحيحاً في الفترة المفتوحة', 'correction_transaction_id' => $correction->id])->assertSessionHasNoErrors();
        $this->assertSame($correction->id, $line->fresh()->correction_transaction_id);
        $this->assertSame($snapshot, $statement->fresh()->snapshot);
        $this->assertSame('-100.00', $payment->fresh()->amount);
        $this->assertSame('0.00', $correction->cash_effect_amount);
        $this->assertSame('responded', $line->fresh()->status);
        $this->get(route('financial-audit.show', $statement))->assertInertia(fn ($page) => $page
            ->where('lines.data.0.details.collectionEffect', '100.00')
            ->where('lines.data.0.linkedCorrection.ledgerEffect', '20.00')
            ->where('lines.data.0.linkedCorrection.collectionEffect', '0.00'));
    }

    public function test_snapshots_and_review_history_cannot_be_overwritten(): void
    {
        [$branch, $sender] = $this->branchPayment();
        $statement = $this->submit($branch, $sender);
        $original = $statement->snapshot;
        try {
            $statement->update(['snapshot' => ['report' => ['actualCollectionTotal' => '999.00']]]);
            $this->fail('Snapshot overwrite was accepted.');
        } catch (ValidationException) {
            $this->assertSame($original, $statement->fresh()->snapshot);
        }
        try {
            $statement->lines()->sole()->update(['details' => ['collectionEffect' => '999.00']]);
            $this->fail('Line overwrite was accepted.');
        } catch (ValidationException) {
            $this->assertSame('100.00', $statement->lines()->sole()->details['collectionEffect']);
        }
        $this->expectException(ValidationException::class);
        $statement->events()->sole()->update(['notes' => 'changed']);
    }

    public function test_audit_routes_require_login(): void
    {
        $this->get(route('financial-audit.index'))->assertRedirect(route('login'));
        $this->post(route('financial-audit.store'), [])->assertRedirect(route('login'));
    }
}
