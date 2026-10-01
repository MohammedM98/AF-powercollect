<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\AnalyzePaymentReceiptRequest;
use App\Http\Requests\ConfirmPaymentReceiptRequest;
use App\Models\PaymentProvider;
use App\Models\PaymentReceipt;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Support\CloudReceiptOcr;
use App\Support\ReceiptExtraction;
use App\Support\ReceiptText;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MobilePaymentReceiptController extends Controller
{
    public function providers(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        return response()->json(['data' => PaymentProvider::query()->where('is_active', true)
            ->orderBy('id')->get(['id', 'code', 'name_en', 'name_ar', 'type'])]);
    }

    public function analyze(AnalyzePaymentReceiptRequest $request, CloudReceiptOcr $ocr, ReceiptExtraction $extraction): JsonResponse
    {
        $image = $request->file('image');
        $hash = hash_file('sha256', $image->getRealPath());
        $existing = PaymentReceipt::query()->where('collector_id', $request->user()->id)
            ->where('file_hash', $hash)->whereIn('ocr_status', ['processed', 'confirmed'])->latest('id')->first();
        if ($existing) {
            return $this->analysisResponse($existing, $request->boolean('manual'));
        }
        $path = $image->store('payment-receipts/'.$request->user()->id, 'local');
        if (! is_string($path)) {
            abort(503, 'تعذر حفظ الإيصال بأمان. أعد المحاولة.');
        }
        try {
            $receipt = PaymentReceipt::query()->create([
                'collector_id' => $request->user()->id,
                'original_file_path' => $path,
                'file_hash' => $hash,
                'provider_id' => $request->integer('provider_id') ?: null,
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }
        $provider = $receipt->provider;
        try {
            if ($request->boolean('manual')) {
                $result = ['raw' => [], 'text' => '', 'confidence' => 0.0];
            } else {
                $result = $ocr->recognize($request->file('processed_image') ?? $image);
            }
            $fields = $extraction->extract($result['text'], $result['confidence'], $provider);
            $receipt->update([
                'ocr_status' => $request->boolean('manual') ? 'failed' : 'processed',
                'provider_id' => $fields['provider_id'],
                'provider_confidence' => $fields['provider_confidence'],
                'ocr_raw_response' => $result['raw'],
                'extracted_fields' => [...$fields, 'raw_text' => $result['text']],
                'processed_at' => now(),
            ]);
        } catch (RuntimeException $exception) {
            $fields = $extraction->extract('', 0, $provider);
            $receipt->update(['ocr_status' => 'failed', 'processed_at' => now(),
                'extracted_fields' => [...$fields, 'raw_text' => '', 'warnings' => [
                    ...$fields['warnings'],
                    ['field' => 'image', 'code' => 'ocr_unavailable', 'message' => $exception->getMessage()],
                ]]]);
        }

        return $this->analysisResponse($receipt);
    }

    private function analysisResponse(PaymentReceipt $receipt, bool $manual = false): JsonResponse
    {
        $fields = $receipt->extracted_fields ?? [];
        $warnings = $fields['warnings'] ?? [];
        if (PaymentReceipt::query()->where('file_hash', $receipt->file_hash)->where('id', '!=', $receipt->id)->exists()
            || $receipt->confirmed_at !== null) {
            $warnings[] = ['field' => 'image', 'code' => 'duplicate_image', 'message' => 'هذه الصورة رُفعت سابقًا. تأكد أن الدفعة لم تُسجل.'];
        }
        if ($manual) {
            $warnings[] = ['field' => 'image', 'code' => 'manual_entry', 'message' => 'أدخل البيانات من الإيصال وراجعها يدويًا.'];
        }
        if (! empty($fields['transaction_reference']) && ! empty($fields['provider_id'])) {
            $reference = hash('sha256', ReceiptText::reference($fields['transaction_reference']));
            if (PaymentReceipt::query()->where('provider_id', $fields['provider_id'])->where('normalized_reference', $reference)->exists()) {
                $warnings[] = ['field' => 'transaction_reference', 'code' => 'duplicate_reference', 'message' => 'رقم التحويل مسجل سابقًا لهذا المزود.'];
            }
        }

        return response()->json(['receipt_id' => $receipt->id, 'ocr_status' => $receipt->ocr_status,
            'fields' => $fields, 'warnings' => $warnings, 'payment_id' => $receipt->payment_id]);
    }

    public function confirm(ConfirmPaymentReceiptRequest $request, PaymentReceipt $receipt): JsonResponse
    {
        $validated = $request->validated();
        $subscriber = Subscriber::query()->visibleTo($request->user())->findOrFail($validated['subscriber_id']);
        $this->authorize('recordPayment', $subscriber);
        $provider = PaymentProvider::query()->where('is_active', true)->findOrFail($validated['provider_id']);
        $exchangeRate = $validated['currency'] === 'ILS' ? 1 : (float) $validated['exchange_rate'];
        if ((float) $validated['amount'] * $exchangeRate > 1000000) {
            throw ValidationException::withMessages(['amount' => 'قيمة الدفعة بالشيكل تتجاوز الحد المسموح.']);
        }

        try {
            $payment = DB::transaction(function () use ($receipt, $validated, $subscriber, $provider, $request): SubscriberTransaction {
                $locked = PaymentReceipt::query()->lockForUpdate()->findOrFail($receipt->id);
                if ($locked->payment_id !== null) {
                    if ($locked->payment->subscriber_id !== $subscriber->id) {
                        throw ValidationException::withMessages(['receipt' => 'هذا الإيصال مسجل لمشترك آخر.']);
                    }

                    return $locked->payment;
                }
                if ($locked->ocr_status === 'pending') {
                    throw ValidationException::withMessages(['receipt' => 'انتظر اكتمال معالجة الإيصال.']);
                }
                if (! Storage::disk('local')->exists($locked->original_file_path)) {
                    throw ValidationException::withMessages(['image' => 'الصورة الأصلية غير متاحة؛ أرفق الإيصال مجددًا.']);
                }
                $reference = hash('sha256', ReceiptText::reference($validated['transaction_reference']));
                if (PaymentReceipt::query()->where('confirmed_file_hash', $locked->file_hash)->exists()
                    || PaymentReceipt::query()->where('provider_id', $provider->id)->where('normalized_reference', $reference)->exists()) {
                    throw ValidationException::withMessages(['transaction_reference' => 'الصورة أو رقم التحويل مسجل سابقًا.']);
                }
                $confirmed = [
                    ...$validated,
                    'provider' => $provider->code,
                    'transferred_at' => CarbonImmutable::parse($validated['transferred_at'])->toIso8601String(),
                    'warnings' => ReceiptExtraction::dateWarnings($validated['transferred_at']),
                    'corrections' => [],
                ];
                foreach (['provider_id', 'transaction_reference', 'sender_name', 'sender_account', 'amount', 'currency', 'transferred_at'] as $field) {
                    $original = $locked->extracted_fields[$field] ?? null;
                    $value = $confirmed[$field] ?? null;
                    if ((string) $original !== (string) $value) {
                        $confirmed['corrections'][$field] = ['extracted' => $original, 'confirmed' => $value];
                    }
                }
                $locked->update(['provider_id' => $provider->id, 'normalized_reference' => $reference,
                    'confirmed_file_hash' => $locked->file_hash, 'confirmed_fields' => $confirmed]);
                $payment = SubscriberTransaction::recordPayment($subscriber, $request->user(), [
                    'mobile_operation_id' => (string) Str::uuid(),
                    'amount' => $validated['amount'], 'currency' => $validated['currency'],
                    'exchange_rate' => $validated['exchange_rate'] ?? null,
                    'payment_method' => 'bank_transfer', 'bank_name' => $provider->name_ar,
                    'sender_name' => $validated['sender_name'],
                    'reference_number' => $validated['transaction_reference'],
                    'notes' => $validated['notes'] ?? null,
                ]);
                $locked->update(['payment_id' => $payment->id, 'ocr_status' => 'confirmed', 'confirmed_at' => now()]);

                return $payment;
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['transaction_reference' => 'الصورة أو رقم التحويل مسجل سابقًا.']);
        }

        return response()->json(['id' => $payment->id, 'receipt_id' => $receipt->id, 'status' => 'recorded',
            'amount' => $payment->currency_amount, 'currency' => $payment->currency->value,
            'voucher_number' => $payment->printedVoucherNumber()], 201);
    }

    public function image(Request $request, PaymentReceipt $receipt): StreamedResponse
    {
        abort_unless($receipt->collector_id === $request->user()->id, 404);
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);
        abort_unless(Storage::disk('local')->exists($receipt->original_file_path), 404);

        return Storage::disk('local')->response($receipt->original_file_path, 'receipt',
            ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
