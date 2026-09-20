<div>
    <!-- Top bar -->
    <header class="bg-violet-950">
        <div class="mx-auto flex max-w-screen-2xl items-center justify-end gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <x-dropdown align="left" width="56">
                <x-slot name="trigger">
                    <button class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white transition hover:bg-white/20">
                        {{ Illuminate\Support\Str::substr(Auth::user()->name, 0, 1) }}
                    </button>
                </x-slot>

                <x-slot name="content">
                    <div class="border-b border-gray-100 px-4 py-3">
                        <div class="truncate text-sm font-semibold text-gray-900">{{ Auth::user()->name }}</div>
                        <div class="truncate text-xs text-gray-500">{{ __(Auth::user()->role->label()) }}</div>
                    </div>

                    <x-dropdown-link :href="route('profile.edit')">
                        {{ __('Profile') }}
                    </x-dropdown-link>

                    <form method="POST" action="{{ route('logout') }}">
                        @csrf
                        <x-dropdown-link :href="route('logout')"
                                onclick="event.preventDefault();
                                            this.closest('form').submit();">
                            {{ __('Log Out') }}
                        </x-dropdown-link>
                    </form>
                </x-slot>
            </x-dropdown>

            <a href="{{ route('dashboard') }}" class="flex min-w-0 items-center gap-3">
                <span class="min-w-0 text-right">
                    <span class="block truncate text-lg font-extrabold leading-tight text-white">{{ config('app.name') }}</span>
                    <span class="block truncate text-xs text-violet-300">
                        {{ Auth::user()->branch?->name ?? __('Electricity Collection System') }}
                    </span>
                </span>
                <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm">
                    <x-application-logo class="h-full w-full object-contain" />
                </span>
            </a>
        </div>
    </header>

    <!-- Section nav -->
    <nav class="bg-[#170f38]">
        <div class="mx-auto flex max-w-screen-2xl items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
            <a href="{{ route('dashboard') }}"
               class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                      {{ request()->routeIs('dashboard') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                {{ __('Dashboard') }}
                <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                </svg>
            </a>

            @can('viewAny', App\Models\Branch::class)
                <a href="{{ route('branches.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('branches.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Branches') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                </a>
            @endcan

            @can('viewAny', App\Models\Subscriber::class)
                <a href="{{ route('subscribers.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('subscribers.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Subscribers') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3.75m8.5-3.75l1 3.75m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                </a>
            @endcan

            @can('viewAny', App\Models\User::class)
                <a href="{{ route('users.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('users.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Users') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.294M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                </a>
            @endcan

            @can('viewAny', App\Models\Tariff::class)
                <a href="{{ route('tariffs.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('tariffs.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Tariffs') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </a>
            @endcan

            @can('viewAny', App\Models\MeterBox::class)
                <a href="{{ route('meter-boxes.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('meter-boxes.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Meter Boxes') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3.75v16.5h16.5V3.75H3.75zM3.75 9h16.5M9 3.75v16.5" />
                    </svg>
                </a>
            @endcan

            @can('viewAny', App\Models\Area::class)
                <a href="{{ route('areas.index') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('areas.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Areas') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                    </svg>
                </a>
            @endcan

            @can('manage', App\Models\Permission::class)
                <a href="{{ route('settings.permissions.edit') }}"
                   class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                          {{ request()->routeIs('settings.permissions.*') ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white' }}">
                    {{ __('Settings') }}
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </a>
            @endcan
        </div>
    </nav>
</div>
