<!DOCTYPE html>
<html lang="ar" dir="rtl">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <link rel="preload" href="{{ Vite::asset('resources/fonts/ibm-plex-sans-arabic-arabic-400.woff2') }}" as="font" type="font/woff2" crossorigin>

        <!-- Theme and table density: apply the saved choices before the page paints, so there is no flash. -->
        <script nonce="{{ Vite::cspNonce() }}">
            try {
                const theme = localStorage.getItem('theme');
                if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                }
                if (localStorage.getItem('table-density') === 'compact') {
                    document.documentElement.dataset.tableDensity = 'compact';
                }
            } catch (e) {}
        </script>

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/js/app.jsx'])
        @inertiaHead
    </head>
    <body class="font-sans antialiased bg-gray-50 text-gray-900">
        @inertia
    </body>
</html>
