<?php

namespace Tests\Feature;

use App\Enums\CashTransferStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CashTransferTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $accountant;

    private User $treasurer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
        $this->branch = Branch::factory()->create();
        $this->accountant = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $this->accountant->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings]));
        $this->treasurer = User::factory()->accountant()->create();
        $this->treasurer->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings]));
    }

    public function test_the_counted_cash_of_an_approved_closing_is_handed_over_with_proof_and_stays_in_transit_until_received(): void
    {
        $closing = Closing::factory()->approved()->create(['branch_id' => $this->branch->id, 'counted_cash' => '950.00']);

        $this->actingAs($this->accountant)->post(route('closings.transfers.store', $closing), $this->handover(['amount' => '950']))
            ->assertSessionHasNoErrors();

        $transfer = CashTransfer::sole();
        $this->assertSame(CashTransferStatus::InTransit, $transfer->status);
        $this->assertSame('950.00', $transfer->amount);
        $this->assertSame($this->treasurer->id, $transfer->recipient_id);
        Storage::disk('local')->assertExists($transfer->proof_path);
        $this->assertDatabaseCount('subscriber_transactions', 0);
        $this->get(route('closings.index', ['tab' => 'handover', 'date' => $closing->period_start->toDateString()]))
            ->assertInertia(fn ($page) => $page
                ->where('handover.branchCash', '0.00')
                ->where('handover.inTransit', '950.00')
                ->where('handover.received', '0.00'));

        $this->post(route('cash-transfers.receive', $transfer))->assertForbidden();
        $this->actingAs($this->treasurer)->post(route('cash-transfers.receive', $transfer))->assertSessionHasNoErrors();

        $this->assertSame(CashTransferStatus::Received, $transfer->fresh()->status);
        $this->assertSame($this->treasurer->id, $transfer->fresh()->received_by);
    }

    public function test_cash_can_only_be_handed_over_once_the_closing_is_approved_and_never_more_than_was_counted(): void
    {
        $draft = Closing::factory()->create(['branch_id' => $this->branch->id, 'counted_cash' => '950.00']);
        $approved = Closing::factory()->approved()->forDay('2026-09-29')->create(['branch_id' => $this->branch->id, 'counted_cash' => '950.00']);
        $this->actingAs($this->accountant);

        $this->post(route('closings.transfers.store', $draft), $this->handover())->assertForbidden();
        $this->post(route('closings.transfers.store', $approved), $this->handover(['amount' => '600']))->assertSessionHasNoErrors();
        $this->post(route('closings.transfers.store', $approved), $this->handover(['amount' => '400']))
            ->assertSessionHasErrors(['amount' => 'المبلغ أكبر من النقد المعدود الذي لم يُسلَّم بعد (350.00 ₪).']);
        $this->post(route('closings.transfers.store', $approved), [...$this->handover(), 'proof' => null])->assertSessionHasErrors(['proof' => 'أرفق صورة إثبات التسليم.']);
        $this->post(route('closings.transfers.store', $approved), $this->handover(['recipient_id' => User::factory()->collector()->create()->id]))
            ->assertSessionHasErrors('recipient_id');

        $this->assertSame(1, CashTransfer::count());
    }

    public function test_another_branch_cannot_hand_over_this_branchs_cash_or_see_its_proof(): void
    {
        $transfer = CashTransfer::factory()->create();
        $this->actingAs($this->accountant);

        $this->post(route('closings.transfers.store', $transfer->closing), $this->handover())->assertForbidden();
        $this->get(route('cash-transfers.proof', $transfer))->assertForbidden();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function handover(array $overrides = []): array
    {
        return [
            'amount' => '100',
            'method' => 'hand_delivery',
            'recipient_id' => $this->treasurer->id,
            'sent_at' => '2026-10-01T09:00',
            'proof' => UploadedFile::fake()->image('receipt.jpg'),
            ...$overrides,
        ];
    }
}
