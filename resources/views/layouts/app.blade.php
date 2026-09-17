<!DOCTYPE html>
<html lang="ar" dir="rtl" class="overflow-x-hidden">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', 'Laravel') }}</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=cairo:400,500,600,700,800,900&display=swap" rel="stylesheet" />

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="font-sans antialiased bg-gray-50 text-gray-900 overflow-x-hidden">
        <div class="flex min-h-screen">
            @include('layouts.navigation')

            <div class="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
                @isset($header)
                    <header class="bg-white border-b border-gray-100 px-6 sm:px-8 py-5">
                        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div class="min-w-0">{{ $header }}</div>
                            @isset($actions)
                                <div class="shrink-0">{{ $actions }}</div>
                            @endisset
                        </div>
                    </header>
                @endisset

                <main class="flex-1 px-6 sm:px-8 py-8">
                    {{ $slot }}
                </main>
            </div>
        </div>
    </body>
</html>
