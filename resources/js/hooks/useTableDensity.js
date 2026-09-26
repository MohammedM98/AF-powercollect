import { useEffect, useState } from 'react';

const STORAGE_KEY = 'table-density';
const CHANGE_EVENT = 'table-density-change';

/** The density this viewer picked last time ('comfortable' unless they chose 'compact'). */
function readDensity() {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
    } catch {
        return 'comfortable';
    }
}

/**
 * How tightly table rows are spaced, remembered in this browser. It is set
 * on <html> as `data-table-density`, so every `.data-table` follows it
 * (see app.css) without each page passing it down.
 */
export function useTableDensity() {
    const [density, setDensity] = useState(readDensity);

    useEffect(() => {
        document.documentElement.dataset.tableDensity = density;
    }, [density]);

    // A page with several tables has several switches; keep them in step.
    useEffect(() => {
        const onChange = (event) => setDensity(event.detail);

        window.addEventListener(CHANGE_EVENT, onChange);
        return () => window.removeEventListener(CHANGE_EVENT, onChange);
    }, []);

    function changeDensity(next) {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));

        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Storage may be blocked (private mode); the choice still applies for this visit.
        }
    }

    return [density, changeDensity];
}
