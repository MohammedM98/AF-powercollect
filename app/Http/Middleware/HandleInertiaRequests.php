<?php

namespace App\Http\Middleware;

use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\FinancialAuditStatement;
use App\Models\Governorate;
use App\Models\MessageBatch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\PrintTemplate;
use App\Models\ReadingEntrySetting;
use App\Models\SubArea;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Models\UserType;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'appName' => config('app.name'),
            'status' => fn () => $request->session()->get('status'),
            'auth' => $user ? [
                'user' => [
                    'name' => $user->name,
                    'username' => $user->username,
                    'roleLabel' => __($user->role->label()),
                    'branchName' => $user->branch?->name,
                ],
            ] : null,
            'can' => $user ? [
                'viewBranches' => $user->can('viewAny', Branch::class),
                'viewSubscriptions' => $user->can('viewAny', Subscription::class),
                'recordPayments' => $user->can('recordAnyPayment', Subscription::class),
                'viewLedger' => $user->can('viewAny', SubscriptionTransaction::class),
                'viewBranchPerformance' => $user->can('viewBranchPerformance', SubscriptionTransaction::class),
                'viewDebtAging' => $user->can('viewDebtAging', SubscriptionTransaction::class),
                'viewTransactionAudit' => $user->can('viewTransactionAudit', SubscriptionTransaction::class),
                'viewClosings' => $user->can('viewAny', Closing::class),
                'viewFinancialAudit' => $user->can('viewAny', FinancialAuditStatement::class),
                'followBranchAudit' => $user->can('viewBranchStatements', FinancialAuditStatement::class),
                'viewUsers' => $user->can('viewAny', User::class),
                'viewUserTypes' => $user->can('viewAny', UserType::class),
                'viewTariffs' => $user->can('viewAny', Tariff::class),
                'viewCircuitBreakers' => $user->can('viewAny', CircuitBreaker::class),
                'viewMeterBoxes' => $user->can('viewAny', MeterBox::class),
                'viewMeterReadings' => $user->can('viewAny', MeterReading::class),
                'viewMessages' => $user->can('viewAny', MessageBatch::class),
                'sendMessages' => $user->can('create', MessageBatch::class),
                'viewGovernorates' => $user->can('viewAny', Governorate::class) || $user->can('viewAny', SubArea::class),
                'manageSettings' => $user->can('manage', Permission::class),
                'manageReadingSchedule' => $user->can('manage', ReadingEntrySetting::class),
                'manageClosingSchedule' => $user->can('manage', ClosingSetting::class),
                'managePrintTemplates' => $user->can('viewAny', PrintTemplate::class),
            ] : null,
            // A list opened for printing gets the company's print templates for it.
            'printTemplates' => fn () => $user && $request->boolean('print') ? $this->printTemplates($request) : null,
            'activity' => fn () => $user ? $this->recentActivity($user) : null,
        ];
    }

    /**
     * The print templates of the list being printed, its default first, or
     * null for a page that can't keep templates.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function printTemplates(Request $request): ?array
    {
        $page = '/'.trim($request->path(), '/');

        if (! array_key_exists($page, PrintTemplate::PAGES)) {
            return null;
        }

        return PrintTemplate::query()
            ->where('page', $page)
            ->with('updatedBy')
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get()
            ->map(fn (PrintTemplate $template) => $template->toDesigner())
            ->all();
    }

    /**
     * The user's own latest saved actions for the bell in the top bar,
     * newest first, and how many of them they haven't seen yet.
     *
     * @return array{unreadCount: int, recent: array<int, array{id: string, action: string, subject: string|null, read: bool, createdAt: string}>}
     */
    private function recentActivity(User $user): array
    {
        return [
            'unreadCount' => $user->unreadNotifications()->count(),
            'recent' => $user->notifications()
                ->limit(10)
                ->get()
                ->map(fn (DatabaseNotification $notification) => [
                    'id' => $notification->id,
                    'action' => $notification->data['action'],
                    'subject' => $notification->data['subject'] ?? null,
                    'read' => $notification->read_at !== null,
                    'createdAt' => $notification->created_at->toIso8601String(),
                ])
                ->all(),
        ];
    }
}
