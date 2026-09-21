<x-app-layout>
    @php
        $scopeSuffix = $scopedToBranch ? 'في فرعك' : 'عبر النظام';
        $subtitle = null;

        if (isset($sections['users'])) {
            $subtitle = isset($sections['branches']) && ! $scopedToBranch
                ? $sections['branches']['total'].' فرع — '.$sections['users']['active'].' مستخدم نشط '.$scopeSuffix
                : $sections['users']['active'].' مستخدم نشط '.$scopeSuffix;
        } elseif (isset($sections['subscribers'])) {
            $subtitle = $sections['subscribers']['active'].' مشترك نشط '.$scopeSuffix;
        } elseif (isset($sections['meterBoxes'])) {
            $subtitle = $sections['meterBoxes']['total'].' طبلون '.$scopeSuffix;
        } elseif (isset($sections['branches'])) {
            $subtitle = $sections['branches']['active'].' من '.$sections['branches']['total'].' فرع نشط حاليًا';
        } elseif (isset($sections['tariffs'])) {
            $subtitle = $sections['tariffs']['total'].' تعرفة معرّفة في النظام';
        }

        $heroKey = collect(['branches', 'users', 'subscribers'])->first(fn ($key) => isset($sections[$key]));
        $hero = $heroKey ? $sections[$heroKey] : null;

        $statLabels = [
            'branches' => 'الفروع النشطة',
            'users' => 'المستخدمون النشطون',
            'subscribers' => 'المشتركون النشطون',
            'meterBoxes' => 'الطبلونات',
            'tariffs' => 'التعرفات',
        ];
        $recentTitles = [
            'branches' => 'الفروع',
            'users' => 'أحدث المستخدمين',
            'subscribers' => 'أحدث المشتركين',
            'meterBoxes' => 'أحدث الطبلونات',
        ];
        $viewAllRoutes = [
            'branches' => 'branches.index',
            'users' => 'users.index',
            'subscribers' => 'subscribers.index',
            'meterBoxes' => 'meter-boxes.index',
        ];
    @endphp

    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ $greeting }}، <span class="text-brand-600">{{ Auth::user()->name }}</span>
        </h2>
        @if ($subtitle)
            <p class="mt-1 text-sm text-gray-500">{{ $subtitle }}</p>
        @endif
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

    @if (empty($sections))
        <div class="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <p class="text-sm text-gray-500">لا توجد بيانات لعرضها حاليًا — لم يتم منحك صلاحية عرض أي جدول بعد.</p>
        </div>
    @else
        <div class="space-y-6">
            @if ($hero)
                <div class="relative overflow-hidden rounded-2xl bg-gradient-to-l from-brand-600 to-pink-500 px-8 py-10 text-white">
                    <svg class="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 max-w-md opacity-20" viewBox="0 0 300 200" fill="none">
                        <circle cx="40" cy="150" r="4" fill="white" />
                        <circle cx="110" cy="90" r="4" fill="white" />
                        <circle cx="170" cy="140" r="4" fill="white" />
                        <circle cx="230" cy="60" r="4" fill="white" />
                        <circle cx="260" cy="120" r="4" fill="white" />
                        <path d="M40 150L110 90L170 140L230 60L260 120M110 90L170 140" stroke="white" stroke-width="1.5" />
                    </svg>
                    <div class="relative">
                        <div class="text-5xl font-black">{{ $hero['activePct'] }}%</div>
                        <p class="mt-2 max-w-sm text-brand-50">{{ $hero['active'] }} من {{ $hero['total'] }} {{ $statLabels[$heroKey] }} حاليًا</p>
                        <p class="text-sm text-white/70">{{ __('Role-based access · Branch-scoped data · No spreadsheets') }}</p>
                    </div>
                </div>
            @endif

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                @foreach ($sections as $key => $section)
                    <div class="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        @if (isset($section['activePct']))
                            <x-stat-ring :percent="$section['activePct']" color="text-brand-500" />
                            <div>
                                <div class="text-2xl font-extrabold text-gray-900">{{ $section['active'] }}</div>
                                <div class="text-sm text-gray-500">{{ $statLabels[$key] }}</div>
                            </div>
                        @else
                            <div>
                                <div class="text-2xl font-extrabold text-gray-900">{{ $section['total'] }}</div>
                                <div class="text-sm text-gray-500">{{ $statLabels[$key] }}</div>
                            </div>
                        @endif
                    </div>
                @endforeach
            </div>

            @foreach (['branches', 'users', 'subscribers', 'meterBoxes'] as $key)
                @continue (! isset($sections[$key]))
                @php($section = $sections[$key])
                <div class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div class="mb-4 flex items-center justify-between">
                        <h3 class="font-bold text-gray-900">{{ $recentTitles[$key] }}</h3>
                        <a href="{{ route($viewAllRoutes[$key]) }}" class="text-sm font-medium text-brand-600 hover:underline">{{ __('See all') }}</a>
                    </div>

                    @if (empty($section['recent']))
                        <p class="py-6 text-center text-sm text-gray-500">لا توجد بيانات بعد.</p>
                    @elseif ($key === 'users')
                        <div class="flex flex-wrap gap-6">
                            @foreach ($section['recent'] as $item)
                                <div class="flex w-24 flex-col items-center text-center">
                                    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                                        {{ Illuminate\Support\Str::substr($item['name'], 0, 1) }}
                                    </div>
                                    <div class="mt-2 w-full truncate text-sm font-medium text-gray-900">{{ $item['name'] }}</div>
                                    <div class="w-full truncate text-xs text-gray-500">{{ $item['subtitle'] }}</div>
                                </div>
                            @endforeach
                        </div>
                    @else
                        @foreach ($section['recent'] as $item)
                            <div class="flex items-center justify-between gap-4 border-t border-gray-50 py-3 first:border-t-0">
                                <div class="min-w-0">
                                    <div class="truncate font-medium text-gray-900">{{ $item['name'] }}</div>
                                    <div class="truncate text-sm text-gray-500">{{ $item['subtitle'] ?? '—' }}</div>
                                </div>
                                @if ($key === 'branches')
                                    <div class="flex shrink-0 items-center gap-3">
                                        @if ($item['active'])
                                            <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{{ __('Active') }}</span>
                                        @else
                                            <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{{ __('Stopped') }}</span>
                                        @endif
                                    </div>
                                @endif
                            </div>
                        @endforeach
                    @endif
                </div>
            @endforeach
        </div>
    @endif
</x-app-layout>
