import { useEffect, useId, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import { HOLD_DURATION, holdProgress, typedCountMatches } from '@/lib/disconnections';

/**
 * The last step of confirming a disconnection: a button held down for three
 * seconds — with the pointer, a finger, or Space / Enter — while a bar fills
 * from 0 to 100%. Letting go, moving off it or cancelling starts it over and
 * sends nothing. At 100% `onConfirm` is called once. For someone who cannot
 * hold a button, typing the number of subscribers is an equal, deliberate
 * way to confirm.
 */
export default function HoldToConfirm({ count, disabled, busy, onConfirm, label }) {
    const id = useId();
    const [progress, setProgress] = useState(0);
    const [typing, setTyping] = useState(false);
    const [typed, setTyped] = useState('');
    const startedAt = useRef(null);
    const frame = useRef(null);
    const done = useRef(false);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    useEffect(() => {
        if (disabled) {
            reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled]);

    function tick(now) {
        const reached = holdProgress(now - startedAt.current);
        setProgress(reached);

        if (reached >= 100) {
            finish();

            return;
        }

        frame.current = requestAnimationFrame(tick);
    }

    function start() {
        if (disabled || busy || done.current || startedAt.current !== null) {
            return;
        }

        startedAt.current = performance.now();
        frame.current = requestAnimationFrame(tick);
    }

    function reset() {
        cancelAnimationFrame(frame.current);
        startedAt.current = null;

        if (!done.current) {
            setProgress(0);
        }
    }

    function finish() {
        cancelAnimationFrame(frame.current);
        startedAt.current = null;

        if (done.current) {
            return;
        }

        done.current = true;
        onConfirm();
    }

    function onKeyDown(event) {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
            event.preventDefault();
            start();
        }
    }

    function onKeyUp(event) {
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            reset();
        }
    }

    const typedMatches = typedCountMatches(typed, count);

    return (
        <div className="space-y-3">
            <button
                type="button"
                disabled={disabled || busy}
                aria-describedby={`${id}-hint`}
                onPointerDown={start}
                onPointerMove={(event) => {
                    // A finger keeps the pointer even off the button, so leaving it is checked by position.
                    const box = event.currentTarget.getBoundingClientRect();

                    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
                        reset();
                    }
                }}
                onPointerUp={reset}
                onPointerCancel={reset}
                onPointerLeave={reset}
                onLostPointerCapture={reset}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
                onBlur={reset}
                onContextMenu={(event) => event.preventDefault()}
                className="relative flex w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-control bg-red-700 px-5 py-3.5 text-base font-bold text-white shadow-card transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700"
            >
                <span aria-hidden="true" className="absolute inset-y-0 start-0 bg-red-950/45" style={{ width: `${progress}%` }} />
                <span className="relative flex items-center gap-2">
                    <Icon name="power" className="h-5 w-5" />
                    {busy ? 'جارٍ التنفيذ…' : progress > 0 ? `استمر بالضغط… ${progress}%` : label}
                </span>
            </button>
            <div
                role="progressbar"
                aria-label="تقدّم الضغط المستمر"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-gray-100"
            >
                <div className="h-full rounded-full bg-red-600 transition-[width] duration-75" style={{ width: `${progress}%` }} />
            </div>
            <p id={`${id}-hint`} className="text-xs leading-5 text-gray-500">
                اضغط مع الاستمرار ٣ ثوانٍ (أو Space / Enter). رفع الإصبع أو الخروج من الزر قبل 100% يلغي العملية دون إرسال أي شيء.
            </p>

            {!typing ? (
                <button type="button" onClick={() => setTyping(true)} disabled={disabled || busy} className="text-xs font-semibold text-gray-600 underline-offset-2 hover:underline disabled:opacity-50">
                    لا تستطيع الضغط المستمر؟ أكّد بكتابة عدد المشتركين
                </button>
            ) : (
                <div className="rounded-control border border-gray-200 bg-gray-50 p-3">
                    <label htmlFor={`${id}-count`} className="mb-1.5 block text-xs font-semibold text-gray-700">
                        اكتب عدد المشتركين المحددين (<b>{count.toLocaleString('en')}</b>) للتأكيد
                    </label>
                    <div className="flex gap-2">
                        <input
                            id={`${id}-count`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            disabled={disabled || busy}
                            className="block w-28 text-sm"
                        />
                        <button
                            type="button"
                            disabled={disabled || busy || !typedMatches || done.current}
                            onClick={finish}
                            className="rounded-control bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            تأكيد القطع
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
