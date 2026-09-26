<?php

namespace App\Http\Middleware;

use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Governorate;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\ReadingEntrySetting;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
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
                'viewSubscribers' => $user->can('viewAny', Subscriber::class),
                'viewUsers' => $user->can('viewAny', User::class),
                'viewTariffs' => $user->can('viewAny', Tariff::class),
                'viewCircuitBreakers' => $user->can('viewAny', CircuitBreaker::class),
                'viewMeterBoxes' => $user->can('viewAny', MeterBox::class),
                'viewMeterReadings' => $user->can('viewAny', MeterReading::class),
                'approveMeterReadings' => $user->can('approveAny', MeterReading::class),
                'viewGovernorates' => $user->can('viewAny', Governorate::class) || $user->can('viewAny', SubArea::class),
                'manageSettings' => $user->can('manage', Permission::class),
                'manageReadingSchedule' => $user->can('manage', ReadingEntrySetting::class),
            ] : null,
            'activity' => fn () => $user ? $this->recentActivity($user) : null,
        ];
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
