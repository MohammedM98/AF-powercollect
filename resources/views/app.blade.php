<!DOCTYPE html>
<html lang="ar" dir="rtl">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <!-- Theme: apply the saved choice (light, dim or dark) before the page paints, so there is no flash. -->
        <script>
            try {
                var theme = localStorage.getItem('theme');

                if (theme === 'dark' || theme === 'dim') {
                    document.documentElement.classList.add('dark');
                }

                if (theme === 'dim') {
                    document.documentElement.classList.add('dim');
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
