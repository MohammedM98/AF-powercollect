import { useState } from 'react';
import Icon from '@/Components/Icon';

/**
 * Switches between the light (default) and dark theme. The choice is
 * remembered in this browser; app.blade.php applies it before the page
 * paints so there is no flash.
 */
export default function ThemeToggle({ className = '' }) {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

    function toggle() {
        const root = document.documentElement;
        const next = !dark;

        root.classList.add('theme-transition');
        root.classList.toggle('dark', next);
        window.setTimeout(() => root.classList.remove('theme-transition'), 400);

        try {
            localStorage.setItem('theme', next ? 'dark' : 'light');
        } catch {
            // Storage may be blocked (private mode); the switch still works for this visit.
        }

        setDark(next);
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الغامق'}
            title={dark ? 'الوضع الفاتح' : 'الوضع الغامق'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-gray-200 bg-surface text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${className}`}
        >
            <Icon name={dark ? 'sun' : 'moon'} className="h-5 w-5" />
        </button>
    );
}
