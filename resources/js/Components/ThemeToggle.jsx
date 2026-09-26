import { useState } from 'react';
import Icon from '@/Components/Icon';

/**
 * The three themes, in the order the button steps through them: light
 * (the default), dim (light navy, between the two) and dark. `classes` are
 * what <html> carries for each: dim is dark with navy neutrals on top.
 */
const THEMES = [
    { value: 'light', label: 'النهاري', icon: 'sun', classes: [] },
    { value: 'dim', label: 'الكحلي', icon: 'sunset', classes: ['dark', 'dim'] },
    { value: 'dark', label: 'الليلي', icon: 'moon', classes: ['dark'] },
];

function currentTheme() {
    const root = document.documentElement;

    if (root.classList.contains('dim')) {
        return 'dim';
    }

    return root.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Steps through the light, dim and dark themes. The choice is remembered
 * in this browser; app.blade.php applies it before the page paints so
 * there is no flash.
 */
export default function ThemeToggle({ className = '' }) {
    const [theme, setTheme] = useState(currentTheme);
    const index = THEMES.findIndex((option) => option.value === theme);
    const current = THEMES[index];
    const next = THEMES[(index + 1) % THEMES.length];

    function step() {
        const root = document.documentElement;

        root.classList.add('theme-transition');
        root.classList.remove('dark', 'dim');
        root.classList.add(...next.classes);
        window.setTimeout(() => root.classList.remove('theme-transition'), 400);

        try {
            localStorage.setItem('theme', next.value);
        } catch {
            // Storage may be blocked (private mode); the switch still works for this visit.
        }

        setTheme(next.value);
    }

    return (
        <button
            type="button"
            onClick={step}
            aria-label={`الوضع ${current.label}. التبديل إلى الوضع ${next.label}`}
            title={`الوضع ${current.label} · اضغط للوضع ${next.label}`}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-gray-200 bg-surface text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${className}`}
        >
            <Icon name={current.icon} className="h-5 w-5" />
        </button>
    );
}
