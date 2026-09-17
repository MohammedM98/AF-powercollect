<div x-data="{ sidebarOpen: false }" class="contents">
    <!-- Mobile top bar -->
    <div class="lg:hidden fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3">
        <a href="{{ route('dashboard') }}" class="flex items-center gap-2">
            <x-application-logo class="h-8 w-auto object-contain" />
            <span class="text-white font-bold">{{ config('app.name') }}</span>
        </a>
        <button @click="sidebarOpen = true" class="text-gray-300 hover:text-white p-2">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
        </button>
    </div>

    <!-- Mobile overlay -->
    <div x-show="sidebarOpen" x-cloak @click="sidebarOpen = false" x-transition.opacity class="fixed inset-0 z-40 bg-black/50 lg:hidden"></div>

    <!-- Sidebar -->
    <aside
        :class="sidebarOpen ? 'translate-x-0' : 'translate-x-full'"
        class="fixed inset-y-0 right-0 z-50 w-72 bg-ink-900 transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 lg:w-72 lg:shrink-0"
    >
        <div class="flex h-full flex-col">
            <div class="flex items-center justify-between px-5 py-5">
                <a href="{{ route('dashboard') }}" class="flex items-center gap-3">
                    <x-application-logo class="h-10 w-auto object-contain" />
                    <div>
                        <div class="text-lg font-extrabold leading-tight text-white">{{ config('app.name') }}</div>
                        <div class="text-xs text-gray-400">{{ __('Electricity Collection System') }}</div>
                    </div>
                </a>
                <button @click="sidebarOpen = false" class="p-1 text-gray-400 hover:text-white lg:hidden">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <a href="{{ route('dashboard') }}"
                   class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition
                          {{ request()->routeIs('dashboard') ? 'border-s-4 border-brand-500 bg-white/10 font-semibold text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white' }}">
                    <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                    </svg>
                    {{ __('Dashboard') }}
                </a>

                @can('viewAny', App\Models\Branch::class)
                    <a href="{{ route('branches.index') }}"
                       class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition
                              {{ request()->routeIs('branches.*') ? 'border-s-4 border-brand-500 bg-white/10 font-semibold text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white' }}">
                        <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        {{ __('Branches') }}
                    </a>
                @endcan

                @can('viewAny', App\Models\User::class)
                    <a href="{{ route('users.index') }}"
                       class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition
                              {{ request()->routeIs('users.*') ? 'border-s-4 border-brand-500 bg-white/10 font-semibold text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white' }}">
                        <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.294M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                        {{ __('Users') }}
                    </a>
                @endcan

                @can('manage', App\Models\Permission::class)
                    <a href="{{ route('settings.permissions.edit') }}"
                       class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition
                              {{ request()->routeIs('settings.permissions.*') ? 'border-s-4 border-brand-500 bg-white/10 font-semibold text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white' }}">
                        <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {{ __('Settings') }}
                    </a>
                @endcan
            </nav>

            <div class="border-t border-white/10 p-3">
                <x-dropdown align="left" width="56">
                    <x-slot name="trigger">
                        <button class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition hover:bg-white/5">
                            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                                {{ Illuminate\Support\Str::substr(Auth::user()->name, 0, 1) }}
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-sm font-semibold text-white">{{ Auth::user()->name }}</div>
                                <div class="truncate text-xs text-gray-400">{{ __(Auth::user()->role->label()) }}</div>
                            </div>
                        </button>
                    </x-slot>

                    <x-slot name="content">
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
            </div>
        </div>
    </aside>
</div>
