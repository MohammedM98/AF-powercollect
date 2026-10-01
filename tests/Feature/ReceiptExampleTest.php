<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\PaymentProvider;
use App\Models\ReceiptExample;
use App\Models\ReceiptExampleRun;
use App\Models\User;
use App\Support\ReceiptAccuracy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReceiptExampleTest extends TestCase
{
    use RefreshDatabase;

    private const OCR_URL = 'https://vision.googleapis.com/v1/images:annotate';

    private function example(): ReceiptExample
    {
        $example = ReceiptExample::factory()->create();
        $image = UploadedFile::fake()->image('receipt.png', 500, 800);
        Storage::disk('local')->put($example->original_file_path, $image->getContent());

        return $example;
    }

    private function payload(): array
    {
        return ['title' => 'Synthetic reference', 'layout' => 'iBURAQ', 'purpose' => 'evaluation',
            'provider_id' => PaymentProvider::query()->where('code', 'bank_of_palestine')->value('id'),
            'verified_fields' => ['transaction_reference' => 'TEST0099', 'sender_name' => 'Test Sender',
                'sender_account' => null, 'amount' => '75.00', 'currency' => 'ILS', 'transferred_at' => '2026-09-23']];
    }

    private function fakeOcr(string $provider = 'Bank of Palestine'): void
    {
        config(['receipt_ocr.google_api_key' => 'test-key']);
        Http::preventStrayRequests();
        Http::fake([self::OCR_URL => Http::response(['responses' => [[
            'fullTextAnnotation' => ['text' => $provider."\nSender name: Test Sender\nTransaction ID: TEST0099\nAmount: 75 ILS\nDate: 2026-09-23",
                'pages' => [['blocks' => [['paragraphs' => [['words' => [['confidence' => 0.98]]]]]]]]],
        ]]])]);
    }

    public function test_guests_are_redirected_and_collectors_cannot_access_library_or_originals(): void
    {
        Storage::fake('local');
        $example = $this->example();
        $this->get(route('settings.receipt-examples.index'))->assertRedirect(route('login'));
        $this->actingAs(User::factory()->collector()->create());
        $this->get(route('settings.receipt-examples.index'))->assertForbidden();
        $this->get(route('settings.receipt-examples.show', $example))->assertForbidden();
        $this->get(route('settings.receipt-examples.image', $example))->assertForbidden();
        $this->post(route('settings.receipt-examples.store'), $this->payload())->assertForbidden();
        $this->put(route('settings.receipt-examples.update', $example), $this->payload())->assertForbidden();
        $this->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])->assertForbidden();
        $this->delete(route('settings.receipt-examples.destroy', $example))->assertForbidden();
        Storage::disk('local')->assertExists($example->original_file_path);
        $this->assertDatabaseCount('receipt_example_runs', 0);
    }

    #[DataProvider('restrictedRoles')]
    public function test_only_super_admin_can_manage_company_receipt_examples(UserRole $role): void
    {
        $user = User::factory()->create(['role' => $role]);
        $this->assertFalse($user->can('manage', ReceiptExample::class));
        $superAdmin = User::factory()->superAdmin()->create();
        $this->assertTrue($superAdmin->can('manage', ReceiptExample::class));
    }

    public static function restrictedRoles(): array
    {
        return [[UserRole::BranchAdmin], [UserRole::Collector], [UserRole::DataEntry], [UserRole::Accountant], [UserRole::FinancialAuditor]];
    }

    public function test_upload_preserves_private_original_and_encrypted_truth_without_payment_or_cloud_call(): void
    {
        Storage::fake('local');
        Http::preventStrayRequests();
        $admin = User::factory()->superAdmin()->create();
        $image = UploadedFile::fake()->image('reference.png', 500, 800);
        $payload = $this->payload();
        $payload['verified_fields']['amount'] = '٧٥٫٠٠';

        $this->actingAs($admin)->post(route('settings.receipt-examples.store'), [
            ...$payload, 'image' => $image, 'payment_id' => 5,
        ])->assertSessionHasNoErrors()->assertRedirect();

        $example = ReceiptExample::sole();
        $this->assertSame($admin->id, $example->uploaded_by);
        $this->assertSame('75.00', $example->verified_fields['amount']);
        $this->assertSame('evaluation', $example->purpose);
        $this->assertSame($image->getContent(), Storage::disk('local')->get($example->original_file_path));
        $this->assertStringNotContainsString('Test Sender', $example->getRawOriginal('verified_fields'));
        $this->assertArrayNotHasKey('original_file_path', $example->toArray());
        $this->assertDatabaseCount('payment_receipts', 0);
        $this->assertDatabaseCount('subscriber_transactions', 0);
        Http::assertNothingSent();
        $this->get(route('settings.receipt-examples.show', $example))->assertInertia(fn ($page) => $page
            ->component('ReceiptExamples/Show')->where('example.verified_fields.sender_name', 'Test Sender')
            ->missing('example.original_file_path')->where('can.manageReceiptExamples', true));
        $this->get(route('settings.receipt-examples.image', $example))->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    #[DataProvider('invalidImageKinds')]
    public function test_invalid_images_and_incomplete_truth_never_create_reference_examples(string $kind): void
    {
        Storage::fake('local');
        Http::preventStrayRequests();
        $image = match ($kind) {
            'not_image' => UploadedFile::fake()->create('receipt.txt', 1, 'text/plain'),
            'too_small' => UploadedFile::fake()->image('receipt.png', 20, 20),
            'too_large' => UploadedFile::fake()->image('receipt.png', 400, 600)->size(8193),
        };
        $payload = $this->payload();
        $payload['verified_fields']['amount'] = '-1';
        $payload['verified_fields']['transferred_at'] = '2026-02-31';

        $this->actingAs(User::factory()->superAdmin()->create())->post(route('settings.receipt-examples.store'), [
            ...$payload, 'image' => $image,
        ])->assertSessionHasErrors(['image', 'verified_fields.amount', 'verified_fields.transferred_at']);
        $this->assertDatabaseCount('receipt_examples', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
        Http::assertNothingSent();
    }

    public static function invalidImageKinds(): array
    {
        return [['not_image'], ['too_small'], ['too_large']];
    }

    public function test_duplicate_image_is_not_added_to_both_tuning_and_evaluation_sets(): void
    {
        Storage::fake('local');
        $admin = User::factory()->superAdmin()->create();
        $image = UploadedFile::fake()->image('receipt.png', 500, 800);
        $this->actingAs($admin)->post(route('settings.receipt-examples.store'), [...$this->payload(), 'image' => $image])
            ->assertSessionHasNoErrors();
        $this->post(route('settings.receipt-examples.store'), [...$this->payload(), 'purpose' => 'tuning', 'image' => $image])
            ->assertSessionHasErrors(['image']);
        $this->assertDatabaseCount('receipt_examples', 1);
        $this->assertCount(1, Storage::disk('local')->allFiles());
    }

    public function test_cloud_test_compares_auto_detected_fields_and_keeps_encrypted_audit_snapshot(): void
    {
        Storage::fake('local');
        $this->freezeTime();
        $example = $this->example();
        $this->fakeOcr();
        $admin = User::factory()->superAdmin()->create();

        $this->actingAs($admin)->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])
            ->assertSessionHasNoErrors()->assertRedirect(route('settings.receipt-examples.show', $example));

        $run = ReceiptExampleRun::sole();
        $this->assertSame('processed', $run->status);
        $this->assertSame($admin->id, $run->tested_by);
        $this->assertSame(6, $run->comparison['matched']);
        $this->assertSame(6, $run->comparison['total']);
        $this->assertSame('TEST0099', $run->expected_fields['transaction_reference']);
        $this->assertStringNotContainsString('Test Sender', $run->getRawOriginal('ocr_raw_response'));
        $this->assertStringNotContainsString('Test Sender', $run->getRawOriginal('comparison'));
        $this->assertDatabaseCount('subscriber_transactions', 0);
        $this->assertDatabaseCount('payment_receipts', 0);
        Http::assertSentCount(1);
        $this->get(route('settings.receipt-examples.index'))->assertInertia(fn ($page) => $page
            ->component('ReceiptExamples/Index')->where('summary.0.tested', 1)->where('summary.0.matched', 6)->where('summary.0.total', 6));
    }

    public function test_selected_reference_provider_does_not_force_automatic_detection_to_appear_correct(): void
    {
        Storage::fake('local');
        $example = $this->example();
        $this->fakeOcr('Jawwal Pay');

        $this->actingAs(User::factory()->superAdmin()->create())->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])
            ->assertSessionHasNoErrors();
        $run = ReceiptExampleRun::sole();
        $this->assertFalse($run->comparison['fields']['provider']['matches']);
        $this->assertSame('jawwal_pay', $run->comparison['fields']['provider']['extracted']);
        $this->assertSame(5, $run->comparison['matched']);
        Http::assertSentCount(1);
    }

    public function test_unconfigured_ocr_keeps_example_and_audits_failure_without_counting_it_as_accuracy(): void
    {
        Storage::fake('local');
        Http::preventStrayRequests();
        config(['receipt_ocr.google_api_key' => null]);
        $example = $this->example();

        $this->actingAs(User::factory()->superAdmin()->create())->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])
            ->assertRedirect(route('settings.receipt-examples.show', $example));
        $run = ReceiptExampleRun::sole();
        $this->assertSame('failed', $run->status);
        $this->assertNull($run->comparison);
        Storage::disk('local')->assertExists($example->original_file_path);
        Http::assertNothingSent();
        $this->get(route('settings.receipt-examples.index'))->assertInertia(fn ($page) => $page
            ->where('summary.0.tested', 0)->where('summary.0.total', 0)->where('ocrConfigured', false));
    }

    public function test_truth_edits_invalidate_accuracy_and_reparse_reuses_text_without_cloud_request(): void
    {
        Storage::fake('local');
        $example = $this->example();
        $this->fakeOcr();
        $admin = User::factory()->superAdmin()->create();
        $this->actingAs($admin)->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])->assertSessionHasNoErrors();
        $firstRun = ReceiptExampleRun::sole();
        $payload = $this->payload();
        $payload['verified_fields']['amount'] = '80.00';

        $this->put(route('settings.receipt-examples.update', $example), $payload)->assertSessionHasNoErrors();
        $this->assertSame(2, $example->fresh()->verification_version);
        $this->assertSame('75.00', $firstRun->fresh()->expected_fields['amount']);
        $this->get(route('settings.receipt-examples.index'))->assertInertia(fn ($page) => $page->where('summary.0.tested', 0));

        $this->post(route('settings.receipt-examples.test', $example), ['mode' => 'reparse'])->assertSessionHasNoErrors();
        $lastRun = $example->runs()->latest('id')->firstOrFail();
        $this->assertSame('reparse', $lastRun->mode);
        $this->assertSame(2, $lastRun->verification_version);
        $this->assertSame('80.00', $lastRun->expected_fields['amount']);
        $this->assertSame(5, $lastRun->comparison['matched']);
        $this->assertFalse($lastRun->comparison['fields']['amount']['matches']);
        Http::assertSentCount(1);
    }

    public function test_changed_parser_version_and_pending_run_are_excluded_from_accuracy(): void
    {
        Storage::fake('local');
        $example = $this->example();
        $this->fakeOcr();
        $this->actingAs(User::factory()->superAdmin()->create())->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])
            ->assertSessionHasNoErrors();
        ReceiptExampleRun::sole()->update(['parser_version' => str_repeat('0', 64)]);
        $this->get(route('settings.receipt-examples.index'))->assertInertia(fn ($page) => $page->where('summary.0.tested', 0));

        ReceiptExampleRun::factory()->for($example)->create();
        $this->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])->assertSessionHasErrors(['test']);
        $this->delete(route('settings.receipt-examples.destroy', $example))->assertSessionHasErrors(['test']);
        Http::assertSentCount(1);
        Storage::disk('local')->assertExists($example->original_file_path);
    }

    public function test_examples_without_an_ocr_result_cannot_reparse_and_missing_original_cannot_be_tested(): void
    {
        Storage::fake('local');
        Http::preventStrayRequests();
        $example = $this->example();
        $this->actingAs(User::factory()->superAdmin()->create());
        $this->post(route('settings.receipt-examples.test', $example), ['mode' => 'reparse'])->assertSessionHasErrors(['test']);
        Storage::disk('local')->delete($example->original_file_path);
        $this->post(route('settings.receipt-examples.test', $example), ['mode' => 'cloud'])->assertNotFound();
        $this->assertDatabaseCount('receipt_example_runs', 0);
        Http::assertNothingSent();
    }

    public function test_delete_removes_private_image_and_test_history_without_touching_payments(): void
    {
        Storage::fake('local');
        $example = $this->example();
        ReceiptExampleRun::factory()->for($example)->create(['status' => 'failed']);

        $this->actingAs(User::factory()->superAdmin()->create())->delete(route('settings.receipt-examples.destroy', $example))
            ->assertRedirect(route('settings.receipt-examples.index'));
        Storage::disk('local')->assertMissing($example->original_file_path);
        $this->assertDatabaseCount('receipt_example_runs', 0);
        $this->assertDatabaseCount('receipt_examples', 0);
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_accuracy_normalizes_digits_spacing_and_reference_separators_but_not_wrong_people_or_currency(): void
    {
        $expected = ['provider' => 'bank_of_palestine', 'transaction_reference' => 'TX-0012', 'sender_name' => 'مرسل تجريبي',
            'sender_account' => '001234', 'amount' => '75.00', 'currency' => 'ILS', 'transferred_at' => '2026-09-23'];
        $actual = ['provider' => 'bank_of_palestine', 'transaction_reference' => 'tx ٠٠١٢', 'sender_name' => 'مرسل  تجريبي',
            'sender_account' => '٠٠١٢٣٤', 'amount' => '٧٥٫٠٠', 'currency' => 'ILS', 'transferred_at' => '2026-09-23T12:00:00+03:00'];
        $result = ReceiptAccuracy::compare($expected, $actual);
        $this->assertSame(7, $result['matched']);
        $this->assertSame(7, $result['total']);
        $actual['sender_name'] = 'مستفيد تجريبي';
        $actual['currency'] = 'USD';
        $result = ReceiptAccuracy::compare($expected, $actual);
        $this->assertSame(5, $result['matched']);
        $this->assertFalse($result['fields']['sender_name']['matches']);
        $this->assertFalse($result['fields']['currency']['matches']);
        $actual['transferred_at'] = '2026-09-22T22:00:00Z';
        $this->assertTrue(ReceiptAccuracy::compare($expected, $actual)['fields']['transferred_at']['matches']);
        $expected['transferred_at'] = '2026-03-03';
        $actual['transferred_at'] = '2026-02-31';
        $this->assertFalse(ReceiptAccuracy::compare($expected, $actual)['fields']['transferred_at']['matches']);
    }
}
