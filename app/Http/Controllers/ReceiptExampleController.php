<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveReceiptExampleRequest;
use App\Models\PaymentProvider;
use App\Models\ReceiptExample;
use App\Models\ReceiptExampleRun;
use App\Support\CloudReceiptOcr;
use App\Support\ReceiptAccuracy;
use App\Support\ReceiptExtraction;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReceiptExampleController extends Controller
{
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('manage', ReceiptExample::class);
        $filters = $request->validate(['search' => ['nullable', 'string', 'max:100'],
            'provider_id' => ['nullable', 'integer'], 'purpose' => ['nullable', Rule::in(['tuning', 'evaluation'])]]);
        $version = ReceiptAccuracy::parserVersion();
        $query = ReceiptExample::query()->with(['provider', 'latestRun:receipt_example_runs.id,receipt_example_runs.receipt_example_id,status,verification_version,parser_version,comparison'])
            ->when($filters['search'] ?? null, fn ($query, $search) => $query->where(fn ($query) => $query->where('title', 'like', '%'.$search.'%')->orWhere('layout', 'like', '%'.$search.'%')))
            ->when($filters['provider_id'] ?? null, fn ($query, $provider) => $query->where('provider_id', $provider))
            ->when($filters['purpose'] ?? null, fn ($query, $purpose) => $query->where('purpose', $purpose));
        $examples = $query->latest('id')->paginate(12)->withQueryString()->through(fn (ReceiptExample $example): array => [
            'id' => $example->id, 'title' => $example->title, 'layout' => $example->layout,
            'purpose' => $example->purpose, 'provider' => $example->provider->name_ar,
            'url' => route('settings.receipt-examples.show', $example),
            'status' => $example->latestRun?->status ?? 'untested',
            'current' => ReceiptAccuracy::isCurrent($example, $example->latestRun, $version),
            'matched' => $example->latestRun?->comparison['matched'] ?? null,
            'total' => $example->latestRun?->comparison['total'] ?? null,
        ]);

        return Inertia::render('ReceiptExamples/Index', [
            'examples' => $examples, 'providers' => $this->providers(), 'filters' => $filters,
            'summary' => ReceiptAccuracy::summary($version), 'ocrConfigured' => filled(config('receipt_ocr.google_api_key')),
            'urls' => ['index' => route('settings.receipt-examples.index'), 'store' => route('settings.receipt-examples.store')],
        ]);
    }

    public function store(SaveReceiptExampleRequest $request): RedirectResponse
    {
        $image = $request->file('image');
        $hash = hash_file('sha256', $image->getRealPath());
        if (ReceiptExample::query()->where('file_hash', $hash)->exists()) {
            throw ValidationException::withMessages(['image' => 'هذه الصورة موجودة في مكتبة الأمثلة؛ افتح المثال الحالي لتعديله.']);
        }
        $path = $image->store('receipt-examples', 'local');
        abort_unless(is_string($path), 503, 'تعذر حفظ الصورة بأمان.');
        try {
            $example = ReceiptExample::query()->create([
                ...$request->safe()->only(['title', 'layout', 'purpose', 'provider_id', 'verified_fields']),
                'uploaded_by' => $request->user()->id, 'original_file_path' => $path, 'file_hash' => $hash,
            ]);
        } catch (UniqueConstraintViolationException) {
            Storage::disk('local')->delete($path);
            throw ValidationException::withMessages(['image' => 'هذه الصورة موجودة في مكتبة الأمثلة.']);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        return redirect()->route('settings.receipt-examples.show', $example)->with('status', 'حُفظ المثال المرجعي.');
    }

    public function show(Request $request, ReceiptExample $receiptExample): InertiaResponse
    {
        $this->authorize('manage', ReceiptExample::class);
        Inertia::encryptHistory();
        $receiptExample->load('uploadedBy');
        $version = ReceiptAccuracy::parserVersion();
        $runs = $receiptExample->runs()->with('testedBy')->latest('id')->limit(10)->get();
        $latest = $runs->first();

        return Inertia::render('ReceiptExamples/Show', [
            'example' => ['id' => $receiptExample->id, 'title' => $receiptExample->title,
                'layout' => $receiptExample->layout, 'purpose' => $receiptExample->purpose,
                'provider_id' => $receiptExample->provider_id, 'verified_fields' => $receiptExample->verified_fields,
                'uploadedBy' => $receiptExample->uploadedBy->name,
                'imageUrl' => route('settings.receipt-examples.image', $receiptExample)],
            'runs' => $runs->map(fn (ReceiptExampleRun $run): array => [
                'id' => $run->id, 'status' => $run->status, 'mode' => $run->mode,
                'testedAt' => $run->tested_at?->toIso8601String(), 'testedBy' => $run->testedBy->name,
                'current' => ReceiptAccuracy::isCurrent($receiptExample, $run, $version),
                'comparison' => $run->comparison, 'error' => $run->error,
                'warnings' => $run->extracted_fields['warnings'] ?? [],
                'rawText' => $run->id === $latest?->id ? ($run->extracted_fields['raw_text'] ?? '') : '',
            ]),
            'canReparse' => $receiptExample->runs()->where('status', 'processed')->exists(),
            'providers' => $this->providers(), 'ocrConfigured' => filled(config('receipt_ocr.google_api_key')),
            'urls' => ['index' => route('settings.receipt-examples.index'), 'update' => route('settings.receipt-examples.update', $receiptExample),
                'test' => route('settings.receipt-examples.test', $receiptExample), 'destroy' => route('settings.receipt-examples.destroy', $receiptExample)],
        ]);
    }

    public function update(SaveReceiptExampleRequest $request, ReceiptExample $receiptExample): RedirectResponse
    {
        DB::transaction(function () use ($request, $receiptExample): void {
            $example = ReceiptExample::query()->lockForUpdate()->findOrFail($receiptExample->id);
            $data = $request->safe()->only(['title', 'layout', 'purpose', 'provider_id', 'verified_fields']);
            $changed = $example->provider_id !== (int) $data['provider_id'] || $example->verified_fields !== $data['verified_fields'];
            $example->update([...$data, 'verification_version' => $example->verification_version + (int) $changed]);
        });

        return redirect()->route('settings.receipt-examples.show', $receiptExample)->with('status', 'حُفظت البيانات المرجعية.');
    }

    public function test(Request $request, ReceiptExample $receiptExample, CloudReceiptOcr $ocr, ReceiptExtraction $extraction): RedirectResponse
    {
        $this->authorize('manage', ReceiptExample::class);
        $validated = $request->validate(['mode' => ['required', Rule::in(['cloud', 'reparse'])]]);
        abort_unless(Storage::disk('local')->exists($receiptExample->original_file_path), 404);
        $previous = $validated['mode'] === 'reparse'
            ? $receiptExample->runs()->where('status', 'processed')->latest('id')->first() : null;
        if ($validated['mode'] === 'reparse' && (! $previous || empty($previous->extracted_fields['raw_text']))) {
            throw ValidationException::withMessages(['test' => 'اختبر الصورة أولًا للحصول على نص مقروء يمكن إعادة تحليله.']);
        }
        $run = DB::transaction(function () use ($receiptExample, $request, $validated): ReceiptExampleRun {
            $example = ReceiptExample::query()->lockForUpdate()->findOrFail($receiptExample->id);
            if ($example->runs()->where('status', 'pending')->where('created_at', '>', now()->subMinutes(2))->exists()) {
                throw ValidationException::withMessages(['test' => 'هناك اختبار قيد التنفيذ لهذا المثال؛ انتظر اكتماله.']);
            }
            $example->runs()->where('status', 'pending')->update(['status' => 'failed', 'error' => 'لم يكتمل الاختبار السابق. أعد المحاولة.', 'tested_at' => now()]);

            return $example->runs()->create([
                'tested_by' => $request->user()->id, 'verification_version' => $example->verification_version,
                'parser_version' => ReceiptAccuracy::parserVersion(), 'mode' => $validated['mode'],
                'expected_fields' => [...$example->verified_fields, 'provider' => $example->provider->code],
            ]);
        });
        try {
            $result = $previous ? ['raw' => $previous->ocr_raw_response, 'text' => $previous->extracted_fields['raw_text'], 'confidence' => $previous->ocr_confidence]
                : $ocr->recognize(new UploadedFile(Storage::disk('local')->path($receiptExample->original_file_path), 'receipt', null, null, true));
            $fields = $extraction->extract($result['text'], $result['confidence']);
            $run->update(['status' => 'processed', 'ocr_confidence' => $result['confidence'],
                'ocr_raw_response' => $result['raw'], 'extracted_fields' => [...$fields, 'raw_text' => $result['text']],
                'comparison' => ReceiptAccuracy::compare($run->expected_fields, $fields), 'tested_at' => now()]);
        } catch (RuntimeException $exception) {
            $run->update(['status' => 'failed', 'error' => $exception->getMessage(), 'tested_at' => now()]);
        }

        return redirect()->route('settings.receipt-examples.show', $receiptExample)->with('status', $run->status === 'processed' ? 'اكتمل اختبار المثال.' : 'تعذر إكمال الاختبار؛ راجع التنبيه.');
    }

    public function image(Request $request, ReceiptExample $receiptExample): StreamedResponse
    {
        $this->authorize('manage', ReceiptExample::class);
        abort_unless(Storage::disk('local')->exists($receiptExample->original_file_path), 404);

        return Storage::disk('local')->response($receiptExample->original_file_path, 'receipt',
            ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function destroy(Request $request, ReceiptExample $receiptExample): RedirectResponse
    {
        $this->authorize('manage', ReceiptExample::class);
        $path = DB::transaction(function () use ($receiptExample): string {
            $example = ReceiptExample::query()->lockForUpdate()->findOrFail($receiptExample->id);
            if ($example->runs()->where('status', 'pending')->where('created_at', '>', now()->subMinutes(2))->exists()) {
                throw ValidationException::withMessages(['test' => 'انتظر انتهاء الاختبار قبل حذف المثال.']);
            }
            $path = $example->original_file_path;
            $example->delete();

            return $path;
        });
        Storage::disk('local')->delete($path);

        return redirect()->route('settings.receipt-examples.index')->with('status', 'حُذف المثال وصورته ونتائج اختباراته.');
    }

    /** @return Collection<int, PaymentProvider> */
    private function providers(): Collection
    {
        return PaymentProvider::query()->where('is_active', true)->orderBy('id')->get(['id', 'code', 'name_ar']);
    }
}
