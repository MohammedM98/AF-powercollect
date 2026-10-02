<?php

namespace App\Http\Controllers;

use App\Enums\MessageChannel;
use App\Enums\MessageKind;
use App\Enums\MessageStatus;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreMessageBatchRequest;
use App\Jobs\SendSubscriberMessage;
use App\Models\MessageBatch;
use App\Models\MessageTemplate;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberMessage;
use App\Models\User;
use App\Notifications\ActionCompleted;
use App\Support\Messaging\MessageComposer;
use App\Support\Messaging\PhoneNumber;
use App\Support\Messaging\SmsGateway;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * Messages to subscribers: a weekly reading, a reminder of what they owe,
 * or any news. A message is written once with `{placeholders}`, sent to
 * the picked subscribers with each one's own details filled in, and kept
 * as a send (MessageBatch) with a message per subscriber. SMS go out
 * through the SMS gateway on the queue; WhatsApp messages are sent by the
 * staff member from their own WhatsApp, one by one, from the send's page.
 */
class MessageController extends Controller
{
    use FiltersDataTable;

    public function __construct(private MessageComposer $composer) {}

    /**
     * Every send so far, newest first.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', MessageBatch::class);

        $actor = $request->user();

        $query = MessageBatch::query()->visibleTo($actor)->withStatusCounts()->with(['branch', 'createdBy']);
        $this->applyDataTableFilters($query, $request, ['body'], ['created_at'], 'created_at', 'desc');
        $this->applyDataTableFilterSelects($query, $request, ['kind', 'channel', 'branch_id']);

        $batches = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (MessageBatch $batch) => $this->batchSummary($batch));

        $filterOptions = [
            $this->filterGroup('kind', 'النوع', MessageKind::options()),
            $this->filterGroup('channel', 'طريقة الإرسال', MessageChannel::options()),
        ];

        if ($actor->isSuperAdmin()) {
            $filterOptions[] = $this->branchFilterGroup();
        }

        return Inertia::render('Messages/Index', [
            'batches' => $batches,
            'canSend' => $actor->can('create', MessageBatch::class),
            'filters' => $this->dataTableState($request, 'created_at', 'desc'),
            'filterOptions' => $filterOptions,
        ]);
    }

    /**
     * Write a message. Its recipients load on request (`only: ['recipients']`)
     * from the criteria in the address, each with the values for the
     * placeholders, so the page shows every subscriber's own text as the
     * message is typed.
     */
    public function create(Request $request): InertiaResponse
    {
        $this->authorize('create', MessageBatch::class);

        $actor = $request->user();
        $meterBoxes = MeterBox::query()->visibleTo($actor)->with('branch')->orderBy('box_number')->get();

        return Inertia::render('Messages/Create', [
            'kinds' => MessageKind::options(),
            'channels' => MessageChannel::options(),
            'smsDeliversMessages' => app(SmsGateway::class)->deliversMessages(),
            'templates' => MessageTemplate::query()->orderBy('name')->get(['id', 'name', 'kind', 'body']),
            'placeholders' => collect(MessageKind::cases())
                ->mapWithKeys(fn (MessageKind $kind) => [$kind->value => MessageComposer::placeholdersFor($kind)]),
            'weekOptions' => MeterReading::recentWeekOptions(8),
            'statusOptions' => SubscriberStatus::options(),
            'branchOptions' => $actor->isSuperAdmin() ? $this->branchFilterGroup()['options'] : [],
            'meterBoxGroups' => $this->meterBoxFilterGroups(
                $meterBoxes,
                $actor->isSuperAdmin() ? fn (MeterBox $box) => $box->branch->name : null,
            ),
            'maxRecipients' => MessageComposer::MAX_RECIPIENTS,
            'criteria' => $this->criteria($request) + ['kind' => $this->requestedKind($request)->value],
            'recipients' => Inertia::optional(fn () => $this->recipientRows($request, $actor)),
        ]);
    }

    /**
     * Send the message to the picked subscribers who have a phone number.
     */
    public function store(StoreMessageBatchRequest $request): RedirectResponse
    {
        $actor = $request->user();
        $kind = MessageKind::from($request->validated('kind'));
        $channel = MessageChannel::from($request->validated('channel'));
        $body = $request->validated('body');

        $recipients = $this->composer
            ->recipients($kind, $actor, [...$this->criteria($request), 'subscriber_ids' => $request->validated('subscriber_ids')])
            ->filter(fn (Subscriber $subscriber): bool => filled($subscriber->contactPhone()));

        if ($recipients->isEmpty()) {
            return back()->withErrors(['subscriber_ids' => 'لا يوجد بين المختارين من لديه رقم هاتف ويطابق شروط الرسالة.']);
        }

        $branchIds = $recipients->pluck('branch_id')->unique();

        $batch = DB::transaction(function () use ($actor, $kind, $channel, $body, $request, $recipients, $branchIds): MessageBatch {
            $batch = MessageBatch::create([
                'branch_id' => $actor->isSuperAdmin() ? ($branchIds->count() === 1 ? $branchIds->first() : null) : $actor->branch_id,
                'kind' => $kind,
                'channel' => $channel,
                'body' => $body,
                'week_start' => $kind === MessageKind::WeeklyReading ? $request->validated('week_start') : null,
                'created_by' => $actor->id,
            ]);

            foreach ($recipients as $subscriber) {
                $batch->messages()->create([
                    'subscriber_id' => $subscriber->id,
                    'branch_id' => $subscriber->branch_id,
                    'phone' => $subscriber->contactPhone(),
                    'body' => $this->composer->render($body, $this->composer->variables($subscriber, $kind)),
                    'status' => MessageStatus::Pending,
                ]);
            }

            return $batch;
        });

        if ($channel === MessageChannel::Sms) {
            $this->dispatchPending($batch);
        }

        $actor->notify(new ActionCompleted('messages-created', __($kind->label()).' — '.$recipients->count()));

        return redirect()
            ->route('messages.show', $batch)
            ->with('status', $channel === MessageChannel::Sms ? 'messages-queued' : 'messages-ready');
    }

    /**
     * One send: its wording and every subscriber's message with how it went.
     */
    public function show(Request $request, MessageBatch $batch): InertiaResponse
    {
        $this->authorize('view', $batch);

        $actor = $request->user();
        $batch = MessageBatch::query()->withStatusCounts()->with(['branch', 'createdBy'])->findOrFail($batch->id);

        $query = $batch->messages()->getQuery()->with(['subscriber', 'sentBy']);
        $this->applyDataTableFilters($query, $request, ['phone', 'body'], ['id', 'status', 'sent_at'], 'id');
        $this->applyDataTableFilterSelects($query, $request, ['status']);

        $countryCode = (string) config('services.sms.country_code');

        $messages = $query->paginate($this->dataTablePerPage($request, 25))
            ->withQueryString()
            ->through(fn (SubscriberMessage $message) => [
                'id' => $message->id,
                'subscriberName' => $message->subscriber?->displayName(),
                'accountNumber' => $message->subscriber?->account_number,
                'phone' => $message->phone,
                'body' => $message->body,
                'status' => $message->status->value,
                'statusLabel' => __($message->status->label()),
                'error' => $message->error,
                'sentAt' => $message->sent_at?->toIso8601String(),
                'sentBy' => $message->sentBy?->name,
                'whatsAppLink' => $batch->channel === MessageChannel::WhatsApp
                    ? PhoneNumber::whatsAppLink($message->phone, $message->body, $countryCode)
                    : null,
            ]);

        return Inertia::render('Messages/Show', [
            'batch' => $this->batchSummary($batch) + ['body' => $batch->body],
            'messages' => $messages,
            'canUpdate' => $actor->can('update', $batch),
            'filters' => $this->dataTableState($request, 'id', 'asc', 25),
            'filterOptions' => [$this->filterGroup('status', 'الحالة', MessageStatus::options())],
        ]);
    }

    /**
     * Send a send's SMS that are still waiting or failed again.
     */
    public function retry(Request $request, MessageBatch $batch): RedirectResponse
    {
        $this->authorize('update', $batch);

        if ($batch->channel !== MessageChannel::Sms) {
            return back()->withErrors(['retry' => 'رسائل واتساب تُرسل من القائمة واحدة واحدة.']);
        }

        $batch->messages()->where('status', MessageStatus::Failed)->update(['status' => MessageStatus::Pending, 'error' => null]);
        $this->dispatchPending($batch);

        return back()->with('status', 'messages-retried');
    }

    /**
     * Record that a WhatsApp message was sent by the staff member.
     */
    public function markSent(Request $request, MessageBatch $batch, SubscriberMessage $message): RedirectResponse
    {
        $this->authorize('update', $batch);

        if ($batch->channel !== MessageChannel::WhatsApp) {
            return back()->withErrors(['message' => 'رسائل SMS تُسجَّل مرسلة عند إرسالها.']);
        }

        $message->markSent($request->user());

        return back();
    }

    /**
     * Queue every message of the send that is still waiting.
     */
    private function dispatchPending(MessageBatch $batch): void
    {
        $batch->messages()
            ->where('status', MessageStatus::Pending)
            ->each(fn (SubscriberMessage $message) => SendSubscriberMessage::dispatch($message));
    }

    /**
     * What a list or a send's page shows about a send.
     *
     * @return array<string, mixed>
     */
    private function batchSummary(MessageBatch $batch): array
    {
        return [
            'id' => $batch->id,
            'kind' => $batch->kind->value,
            'kindLabel' => __($batch->kind->label()),
            'channel' => $batch->channel->value,
            'channelLabel' => __($batch->channel->label()),
            'excerpt' => Str::limit($batch->body, 90),
            'weekStart' => $batch->week_start?->toDateString(),
            'branchName' => $batch->branch?->name ?? 'كل الفروع',
            'createdBy' => $batch->createdBy?->name,
            'createdAt' => $batch->created_at->toIso8601String(),
            'total' => (int) $batch->messages_count,
            'pending' => (int) $batch->pending_count,
            'sent' => (int) $batch->sent_count,
            'failed' => (int) $batch->failed_count,
        ];
    }

    /**
     * The kind of message asked for in the address, a custom one by default.
     */
    private function requestedKind(Request $request): MessageKind
    {
        return MessageKind::tryFrom((string) $request->input('kind')) ?? MessageKind::Custom;
    }

    /**
     * Who the message goes to, as asked for in the request: for a weekly
     * reading the week (the latest ended one by default) and whether only
     * approved readings count, for a balance reminder the least balance,
     * and the subscriber filters — active subscribers by default.
     *
     * @return array{week_start: string, approved_only: bool, min_balance: float, branch_id: ?string, status: ?string, meter_box_name: ?string, meter_box_id: ?string, search: string, subscriber_ids: array<int, int>}
     */
    private function criteria(Request $request): array
    {
        return [
            'week_start' => (string) ($request->input('week_start') ?: MeterReading::latestEndedWeekStart()->toDateString()),
            'approved_only' => $request->boolean('approved_only', true),
            'min_balance' => (float) $request->input('min_balance', 0),
            'branch_id' => $request->filled('branch_id') ? (string) $request->input('branch_id') : null,
            'status' => $request->has('status') ? ((string) $request->input('status') ?: null) : SubscriberStatus::Active->value,
            'meter_box_name' => $request->filled('meter_box_name') ? (string) $request->input('meter_box_name') : null,
            'meter_box_id' => $request->filled('meter_box_id') ? (string) $request->input('meter_box_id') : null,
            'search' => trim((string) $request->input('search')),
            'subscriber_ids' => array_map('intval', (array) $request->input('subscriber_ids', [])),
        ];
    }

    /**
     * The recipients for the compose page's preview.
     *
     * @return array<int, array{id: int, name: string, accountNumber: ?string, phone: ?string, branchName: ?string, variables: array<string, string>}>
     */
    private function recipientRows(Request $request, User $actor): array
    {
        $kind = $this->requestedKind($request);

        return $this->composer->recipients($kind, $actor, $this->criteria($request))
            ->map(fn (Subscriber $subscriber) => [
                'id' => $subscriber->id,
                'name' => $subscriber->displayName(),
                'accountNumber' => $subscriber->account_number,
                'phone' => $subscriber->contactPhone(),
                'branchName' => $subscriber->branch?->name,
                'variables' => $this->composer->variables($subscriber, $kind),
            ])
            ->values()
            ->all();
    }
}
