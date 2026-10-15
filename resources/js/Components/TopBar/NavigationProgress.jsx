import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import './top-bar.css';

// Filter and sort changes refresh the page in place; their line shows only if they take a while.
const QUIET_DELAY = 250;

/** Whether a visit only refreshes the page in place (filters, sorting, a partial reload). */
function refreshesInPlace(visit) {
    return visit.method === 'get' && (Boolean(visit.preserveState) || visit.only?.length > 0);
}

/**
 * The thin burgundy line at the very top while a page opens: it runs most of
 * the way, waits for the page, then completes and fades.
 */
export default function NavigationProgress() {
    const [phase, setPhase] = useState(null);
    const timer = useRef(null);
    const active = useRef(0);

    useEffect(() => {
        const offStart = router.on('start', (event) => {
            active.current += 1;
            clearTimeout(timer.current);
            const run = () => setPhase({ name: 'loading', key: Date.now() });

            if (refreshesInPlace(event.detail.visit)) {
                timer.current = setTimeout(run, QUIET_DELAY);
            } else {
                run();
            }
        });

        const offFinish = router.on('finish', () => {
            active.current = Math.max(0, active.current - 1);

            if (active.current === 0) {
                clearTimeout(timer.current);
                setPhase((current) => (current ? { name: 'done', key: current.key } : null));
            }
        });

        return () => {
            offStart();
            offFinish();
            clearTimeout(timer.current);
        };
    }, []);

    return (
        <div
            key={phase?.key}
            aria-hidden="true"
            className={`tn-progress ${phase?.name === 'loading' ? 'is-loading' : phase?.name === 'done' ? 'is-done' : ''}`}
            onAnimationEnd={() => phase?.name === 'done' && setPhase(null)}
        />
    );
}
