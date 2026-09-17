<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ $greeting }}، <span class="text-brand-600">{{ Auth::user()->name }}</span>
        </h2>
        <p class="mt-1 text-sm text-gray-500">
            @if ($scopedToBranch)
                {{ __(':count active users in your branch', ['count' => $stats['users_active']]) }}
            @else
                {{ __(':branches branches — :users active users across the system', ['branches' => $stats['branches_total'], 'users' => $stats['users_active']]) }}
            @endif
        </p>
    </x-slot>

    <x-slot name="actions">
        @can('create', App\Models\Branch::class)
            <a href="{{ route('branches.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {{ __('New Branch') }}
            </a>
        @elsecan('create', App\Models\User::class)
            <a href="{{ route('users.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {{ __('New User') }}
            </a>
        @endcan
    </x-slot>

    <div class="space-y-6">
        <!-- Hero banner -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-l from-ink-900 via-brand-700 to-brand-500 px-8 py-10 text-white">
            <svg class="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 max-w-md opacity-20" viewBox="0 0 300 200" fill="none">
                <circle cx="40" cy="150" r="4" fill="white" />
                <circle cx="110" cy="90" r="4" fill="white" />
                <circle cx="170" cy="140" r="4" fill="white" />
                <circle cx="230" cy="60" r="4" fill="white" />
                <circle cx="260" cy="120" r="4" fill="white" />
                <path d="M40 150L110 90L170 140L230 60L260 120M110 90L170 140" stroke="white" stroke-width="1.5" />
            </svg>
            <div class="relative">
                <div class="text-5xl font-black">{{ $stats['branches_active_pct'] }}%</div>
                <p class="mt-2 max-w-sm text-brand-50">
                    {{ __(':active of :total branches are currently active', ['active' => $stats['branches_active'], 'total' => $stats['branches_total']]) }}
                </p>
                <p class="text-sm text-white/70">{{ __('Role-based access · Branch-scoped data · No spreadsheets') }}</p>
            </div>
        </div>

        <!-- Stat cards -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <x-stat-ring :percent="$stats['branches_active_pct']" color="text-brand-500" />
                <div>
                    <div class="text-2xl font-extrabold text-gray-900">{{ $stats['branches_active'] }}</div>
                    <div class="text-sm text-gray-500">{{ __('Active Branches') }}</div>
                </div>
            </div>

            <div class="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <x-stat-ring :percent="$stats['users_active_pct']" color="text-blue-500" />
                <div>
                    <div class="text-2xl font-extrabold text-gray-900">{{ $stats['users_active'] }}</div>
                    <div class="text-sm text-gray-500">{{ __('Active Users') }}</div>
                </div>
            </div>

            <div class="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <x-stat-ring :percent="$stats['branch_admins_pct']" color="text-amber-500" />
                <div>
                    <div class="text-2xl font-extrabold text-gray-900">{{ $stats['branch_admins'] }}</div>
                    <div class="text-sm text-gray-500">{{ __('Branch Admins') }}</div>
                </div>
            </div>

            <div class="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <x-stat-ring :percent="$stats['collectors_pct']" color="text-emerald-500" />
                <div>
                    <div class="text-2xl font-extrabold text-gray-900">{{ $stats['collectors'] }}</div>
                    <div class="text-sm text-gray-500">{{ __('Collectors') }}</div>
                </div>
            </div>
        </div>

        <!-- Recent branches -->
        <div class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="font-bold text-gray-900">{{ __('Branches') }}</h3>
                @can('viewAny', App\Models\Branch::class)
                    <a href="{{ route('branches.index') }}" class="text-sm font-medium text-brand-600 hover:underline">{{ __('See all') }}</a>
                @endcan
            </div>

            @forelse ($recentBranches as $branch)
                <div class="flex items-center justify-between gap-4 border-t border-gray-50 py-3 first:border-t-0">
                    <div class="flex min-w-0 items-center gap-3">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                        </div>
                        <div class="min-w-0">
                            <div class="truncate font-medium text-gray-900">{{ $branch->name }}</div>
                            <div class="truncate text-sm text-gray-500">{{ $branch->location ?? '—' }}</div>
                        </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-3">
                        @if ($branch->is_active)
                            <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{{ __('Active') }}</span>
                        @else
                            <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{{ __('Stopped') }}</span>
                        @endif
                    </div>
                </div>
            @empty
                <p class="py-6 text-center text-sm text-gray-500">{{ __('No branches exist yet — create one first.') }}</p>
            @endforelse
        </div>

        <!-- Recent users -->
        <div class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="font-bold text-gray-900">{{ __('Recent Users') }}</h3>
                @can('viewAny', App\Models\User::class)
                    <a href="{{ route('users.index') }}" class="text-sm font-medium text-brand-600 hover:underline">{{ __('See all') }}</a>
                @endcan
            </div>

            @if ($recentUsers->isEmpty())
                <p class="py-6 text-center text-sm text-gray-500">{{ __('No users to manage yet.') }}</p>
            @else
                <div class="flex flex-wrap gap-6">
                    @foreach ($recentUsers as $user)
                        <div class="flex w-24 flex-col items-center text-center">
                            <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                                {{ Illuminate\Support\Str::substr($user->name, 0, 1) }}
                            </div>
                            <div class="mt-2 w-full truncate text-sm font-medium text-gray-900">{{ $user->name }}</div>
                            <div class="w-full truncate text-xs text-gray-500">{{ __($user->role->label()) }}</div>
                        </div>
                    @endforeach
                </div>
            @endif
        </div>
    </div>
</x-app-layout>
