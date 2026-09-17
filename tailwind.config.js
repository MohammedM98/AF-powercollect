import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Cairo', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                brand: {
                    50: '#faf4f3',
                    100: '#f3e2e0',
                    200: '#e6c1bd',
                    300: '#d59a93',
                    400: '#bf6e65',
                    500: '#9c4a44',
                    600: '#833d38',
                    700: '#6b312d',
                    800: '#552724',
                    900: '#41201d',
                },
                ink: {
                    900: '#15161a',
                    800: '#1d1f26',
                    700: '#262832',
                    600: '#33353f',
                },
            },
        },
    },

    plugins: [forms],
};
