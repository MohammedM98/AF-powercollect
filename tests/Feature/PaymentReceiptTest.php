<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\MobileAccessToken;
use App\Models\PaymentProvider;
use App\Models\PaymentReceipt;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PaymentReceiptTest extends TestCase
{
    use RefreshDatabase;

    private const OCR_URL = 'https://vision.googleapis.com/v1/images:annotate';

    private function collector(): User
    {
        $user = User::factory()->collector()->create();
        $user->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user));

        return $user;
    }

    private function fakeOcr(string|array $text): void
    {
        config(['receipt_ocr.google_api_key' => 'test-key']);
        Http::preventStrayRequests();
        $sequence = Http::sequence();
        foreach ((array) $text as $value) {
            $sequence->push(['responses' => [[
                'fullTextAnnotation' => ['text' => $value, 'pages' => [[
                    'blocks' => [['paragraphs' => [['words' => [['confidence' => 0.98]]]]]],
                ]]],
            ]]]);
        }
        Http::fake([self::OCR_URL => $sequence]);
    }

    private function storedReceipt(User $user): PaymentReceipt
    {
        $receipt = PaymentReceipt::factory()->create(['collector_id' => $user->id]);
        Storage::disk('local')->put($receipt->original_file_path, 'private original');

        return $receipt;
    }

    private function confirmation(Subscriber $subscriber, PaymentReceipt $receipt): array
    {
        return [
            'subscriber_id' => $subscriber->id, 'provider_id' => $receipt->provider_id,
            'transaction_reference' => 'TX-0042', 'sender_name' => 'Test Sender',
            'sender_account' => 'ACCOUNT-42', 'amount' => '100.00', 'currency' => 'ILS',
            'transferred_at' => now()->subHour()->toIso8601String(),
            'collector_confirmed' => true, 'review_acknowledged' => true,
        ];
    }

    public function test_receipt_analysis_requires_authentication_and_collection_permission(): void
    {
        Http::preventStrayRequests();
        $this->postJson(route('mobile.payment-receipts.analyze'))->assertUnauthorized();
        $user = User::factory()->collector()->create();
        $user->permissions()->sync([]);
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user))
            ->postJson(route('mobile.payment-receipts.analyze'))->assertForbidden();
        Http::assertNothingSent();
        $this->assertDatabaseCount('payment_receipts', 0);
    }

    public function test_analyze_preserves_private_original_and_encrypted_ocr_without_creating_a_payment(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $text = "Bank of Palestine\nSender name: Test Sender\nTransaction ID: 001234\nAmount: 125 ILS\nDate: 2026-09-29 12:00";
        $this->fakeOcr($text);
        $image = UploadedFile::fake()->image('receipt.png', 600, 900);

        $response = $this->postJson(route('mobile.payment-receipts.analyze'), ['image' => $image])
            ->assertOk()->assertJsonPath('fields.provider', 'bank_of_palestine')
            ->assertJsonPath('fields.amount', '125.00')->assertJsonPath('fields.transaction_reference', '001234')
            ->assertJsonPath('fields.sender_name', 'Test Sender');

        $receipt = PaymentReceipt::findOrFail($response->json('receipt_id'));
        $this->assertSame($user->id, $receipt->collector_id);
        Storage::disk('local')->assertExists($receipt->original_file_path);
        $this->assertSame(hash_file('sha256', $image->getRealPath()), $receipt->file_hash);
        $this->assertSame($image->getContent(), Storage::disk('local')->get($receipt->original_file_path));
        $this->assertStringNotContainsString('Test Sender', $receipt->getRawOriginal('ocr_raw_response'));
        $this->assertSame($text, $receipt->extracted_fields['raw_text']);
        $this->assertDatabaseCount('subscriber_transactions', 0);
        Http::assertSent(fn ($request): bool => $request->url() === self::OCR_URL
            && $request->hasHeader('X-Goog-Api-Key', 'test-key')
            && $request['requests'][0]['imageContext']['languageHints'] === ['ar', 'en']);
    }

    public function test_same_collector_upload_retry_reuses_processed_receipt_without_another_ocr_call(): void
    {
        Storage::fake('local');
        $this->collector();
        $this->fakeOcr("Jawwal Pay\nAmount: 20 ILS");
        $image = UploadedFile::fake()->image('receipt.png', 500, 800);
        $first = $this->postJson(route('mobile.payment-receipts.analyze'), ['image' => $image])->assertOk();

        $this->postJson(route('mobile.payment-receipts.analyze'), ['image' => $image])
            ->assertJsonPath('receipt_id', $first->json('receipt_id'));
        Http::assertSentCount(1);
        $this->assertDatabaseCount('payment_receipts', 1);
    }

    public function test_unknown_or_wrong_provider_requires_visible_review(): void
    {
        Storage::fake('local');
        $this->collector();
        $this->fakeOcr(["Bank of Palestine\nAmount: 20 ILS", "Unrecognized provider\nAmount: 20 ILS"]);
        $wallet = PaymentProvider::where('code', 'jawwal_pay')->firstOrFail();
        $response = $this->postJson(route('mobile.payment-receipts.analyze'), [
            'image' => UploadedFile::fake()->image('receipt.png', 500, 800), 'provider_id' => $wallet->id,
        ])->assertJsonPath('fields.provider_id', $wallet->id);

        $this->assertContains('provider_mismatch', array_column($response->json('warnings'), 'code'));
        $response = $this->postJson(route('mobile.payment-receipts.analyze'), [
            'image' => UploadedFile::fake()->image('other.jpg', 601, 800),
        ])->assertJsonPath('fields.provider_id', null);
        $this->assertContains('provider_uncertain', array_column($response->json('warnings'), 'code'));
    }

    #[DataProvider('invalidImages')]
    public function test_invalid_images_are_rejected_before_storage_or_ocr(string $kind): void
    {
        Storage::fake('local');
        $this->collector();
        Http::preventStrayRequests();
        $image = match ($kind) {
            'text' => UploadedFile::fake()->create('receipt.txt', 1, 'text/plain'),
            'large' => UploadedFile::fake()->image('receipt.png', 300, 300)->size(8193),
            'tiny' => UploadedFile::fake()->image('receipt.png', 20, 20),
            'oversized_dimensions' => UploadedFile::fake()->image('receipt.png', 12001, 100),
        };

        $this->postJson(route('mobile.payment-receipts.analyze'), ['image' => $image])
            ->assertUnprocessable()->assertInvalid(['image']);
        Http::assertNothingSent();
        $this->assertDatabaseCount('payment_receipts', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public static function invalidImages(): array
    {
        return [['text'], ['large'], ['tiny'], ['oversized_dimensions']];
    }

    #[DataProvider('ocrFailures')]
    public function test_ocr_failure_keeps_original_and_allows_manual_confirmation(string $failure): void
    {
        Storage::fake('local');
        $user = $this->collector();
        config(['receipt_ocr.google_api_key' => $failure === 'unconfigured' ? null : 'test-key']);
        Http::preventStrayRequests();
        Http::fake([self::OCR_URL => match ($failure) {
            'timeout' => fn () => throw new ConnectionException('Timeout'),
            'http_error' => Http::response(['error' => 'not available'], 503),
            'provider_error' => Http::response(['responses' => [['error' => ['message' => 'failed']]]]),
            default => Http::response([]),
        }]);

        $response = $this->postJson(route('mobile.payment-receipts.analyze'), [
            'image' => UploadedFile::fake()->image('receipt.png', 500, 800),
        ])->assertOk()->assertJsonPath('ocr_status', 'failed');
        $receipt = PaymentReceipt::findOrFail($response->json('receipt_id'));
        Storage::disk('local')->assertExists($receipt->original_file_path);
        $this->assertContains('ocr_unavailable', array_column($response->json('warnings'), 'code'));
        $provider = PaymentProvider::where('code', 'bank_of_palestine')->firstOrFail();
        $receipt->provider_id = $provider->id;
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $this->confirmation($subscriber, $receipt))
            ->assertCreated()->assertJsonPath('status', 'recorded');
    }

    public static function ocrFailures(): array
    {
        return [['unconfigured'], ['timeout'], ['http_error'], ['provider_error']];
    }

    public function test_confirmation_records_reviewed_amount_corrections_and_only_one_ledger_payment_on_retry(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $receipt = $this->storedReceipt($user);
        $receipt->update(['extracted_fields' => ['amount' => '99.00', 'sender_name' => 'OCR Sender']]);
        $payload = $this->confirmation($subscriber, $receipt);

        $response = $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertCreated()->assertJsonPath('amount', '100.00');
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertCreated()->assertJsonPath('id', $response->json('id'));
        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), [
            ...$payload, 'subscriber_id' => $otherSubscriber->id,
        ])->assertUnprocessable()->assertInvalid(['receipt']);

        $receipt->refresh();
        $payment = $receipt->payment;
        $this->assertSame('confirmed', $receipt->ocr_status);
        $this->assertNotNull($receipt->confirmed_at);
        $this->assertSame('-100.00', $payment->amount);
        $this->assertSame('Test Sender', $payment->sender_name);
        $this->assertSame('TX-0042', $payment->reference_number);
        $this->assertSame($user->id, $payment->recorded_by);
        $this->assertSame(['extracted' => '99.00', 'confirmed' => '100.00'], $receipt->confirmed_fields['corrections']['amount']);
        $this->assertSame(1, SubscriberTransaction::where('type', 'payment')->count());
    }

    public function test_normalized_duplicate_reference_and_duplicate_original_image_cannot_be_paid_again(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $first = $this->storedReceipt($user);
        $this->postJson(route('mobile.payment-receipts.confirm', $first), $this->confirmation($subscriber, $first))->assertCreated();
        $second = $this->storedReceipt($user);
        $payload = $this->confirmation($subscriber, $second);
        $payload['transaction_reference'] = 'tx ٠٠٤٢';

        $this->postJson(route('mobile.payment-receipts.confirm', $second), $payload)
            ->assertUnprocessable()->assertInvalid(['transaction_reference']);
        $second->update(['file_hash' => $first->file_hash]);
        $payload['transaction_reference'] = 'DIFFERENT-77';
        $this->postJson(route('mobile.payment-receipts.confirm', $second), $payload)
            ->assertUnprocessable()->assertInvalid(['transaction_reference']);

        $this->assertSame(1, SubscriberTransaction::where('type', 'payment')->count());
        $this->assertNull($second->fresh()->confirmed_at);
    }

    public function test_other_collectors_cannot_confirm_or_read_an_original_receipt(): void
    {
        Storage::fake('local');
        $owner = User::factory()->collector()->create();
        $receipt = $this->storedReceipt($owner);
        $viewer = $this->collector();
        $subscriber = Subscriber::factory()->create(['branch_id' => $viewer->branch_id]);

        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $this->confirmation($subscriber, $receipt))->assertNotFound();
        $this->getJson(route('mobile.payment-receipts.image', $receipt))->assertNotFound();
        $this->assertNull($receipt->fresh()->payment_id);
    }

    public function test_branch_scope_review_confirmation_and_positive_amount_are_enforced(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $receipt = $this->storedReceipt($user);
        $otherBranch = Subscriber::factory()->create();
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $this->confirmation($otherBranch, $receipt))
            ->assertUnprocessable()->assertInvalid(['subscriber_id']);
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $payload = $this->confirmation($subscriber, $receipt);
        $payload['collector_confirmed'] = false;
        $payload['review_acknowledged'] = false;
        $payload['amount'] = '-1';

        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertUnprocessable()->assertInvalid(['collector_confirmed', 'review_acknowledged', 'amount']);
        $this->assertNull($receipt->fresh()->payment_id);
    }

    public function test_foreign_currency_requires_exchange_rate_and_keeps_transfer_date_warnings(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $receipt = $this->storedReceipt($user);
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $payload = [...$this->confirmation($subscriber, $receipt), 'currency' => 'USD',
            'transferred_at' => now()->subDays(60)->toIso8601String()];
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertUnprocessable()->assertInvalid(['exchange_rate']);

        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), [...$payload, 'exchange_rate' => '3.5'])
            ->assertCreated()->assertJsonPath('currency', 'USD');
        $receipt->refresh();
        $this->assertSame('-350.00', $receipt->payment->amount);
        $this->assertSame('old_date', $receipt->confirmed_fields['warnings'][0]['code']);
    }

    public function test_manual_entry_preserves_original_and_skips_cloud_ocr(): void
    {
        Storage::fake('local');
        $this->collector();
        Http::preventStrayRequests();
        $this->postJson(route('mobile.payment-receipts.analyze'), [
            'image' => UploadedFile::fake()->image('receipt.png', 500, 800), 'manual' => true,
        ])->assertOk()->assertJsonPath('ocr_status', 'failed');
        $receipt = PaymentReceipt::sole();
        Storage::disk('local')->assertExists($receipt->original_file_path);
        Http::assertNothingSent();
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_iburaq_provider_uses_sender_bank_instead_of_recipient_wallet(): void
    {
        Storage::fake('local');
        $this->collector();
        $this->fakeOcr("إشعار حوالة iBURAQ\n23/09/2026 التاريخ\nTEST0099 الرقم المرجعي\nبيانات المرسل\nمرسل تجريبي من حساب\n000111222333 الحساب\nبنك فلسطين البنك\nمعلومات المرسل إليه\nمستفيد تجريبي إلى المستفيد\nبال باي اسم البنك / المحفظة\nبيانات الحوالة\n75 شيكل المبلغ الإجمالي");

        $this->postJson(route('mobile.payment-receipts.analyze'), [
            'image' => UploadedFile::fake()->image('receipt.png', 500, 800),
        ])->assertOk()->assertJsonPath('fields.provider', 'bank_of_palestine')
            ->assertJsonPath('fields.sender_name', 'مرسل تجريبي')
            ->assertJsonPath('fields.sender_account', '000111222333')
            ->assertJsonPath('fields.amount', '75.00')->assertJsonPath('fields.currency', 'ILS')
            ->assertJsonPath('fields.transaction_reference', 'TEST0099');
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_confirmation_requires_completed_processing_and_original_image(): void
    {
        Storage::fake('local');
        $user = $this->collector();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);
        $receipt = $this->storedReceipt($user);
        $receipt->update(['ocr_status' => 'pending']);
        $payload = $this->confirmation($subscriber, $receipt);
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertUnprocessable()->assertInvalid(['receipt']);

        $receipt->update(['ocr_status' => 'processed']);
        Storage::disk('local')->delete($receipt->original_file_path);
        $this->postJson(route('mobile.payment-receipts.confirm', $receipt), $payload)
            ->assertUnprocessable()->assertInvalid(['image']);
        $this->assertNull($receipt->fresh()->payment_id);
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }
}
