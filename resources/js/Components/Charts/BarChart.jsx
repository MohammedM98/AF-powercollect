import { useState } from 'react';
import { formatShortDay } from '@/lib/dates';

const TICKS = 4;

/** The smallest "round" number (1, 2 or 5 × 10ⁿ) at or above `value`, so the axis reads cleanly. */
function niceMax(value) {
    if (value <= 0) {
        return TICKS;
    }

    const magnitude = 10 ** Math.floor(Math.log10(value / TICKS));
    const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate * TICKS >= value);

    return step * TICKS;
}

/**
 * One bar per day, oldest on the left, today highlighted. Hovering a bar
 * shows its day and value; a hidden table carries the same figures for
 * screen readers. `data` is `[{ date: 'Y-m-d', value }]`.
 */
export default function BarChart({ data, label, formatValue = (value) => value.toLocaleString('en-US'), height = 160 }) {
    const [hovered, setHovered] = useState(null);
    const max = niceMax(Math.max(0, ...data.map((point) => point.value)));
    const ticks = Array.from({ length: TICKS + 1 }, (_, index) => (max / TICKS) * (TICKS - index));
    const labelEvery = Math.max(1, Math.ceil(data.length / 7));
    const active = hovered !== null ? data[hovered] : null;

    return (
        <figure className="relative" dir="ltr">
            <div className="flex gap-2">
                <div
                    className="flex shrink-0 flex-col justify-between text-end font-display text-[12px] text-gray-400"
                    style={{ height }}
                    aria-hidden="true"
                >
                    {ticks.map((tick) => (
                        <span key={tick} className="-my-1.5 leading-3">
                            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                        </span>
                    ))}
                </div>

                <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                        {ticks.map((tick) => (
                            <span
                                key={tick}
                                className="border-t border-dashed border-gray-100 first:border-transparent last:border-solid last:border-gray-200"
                            />
                        ))}
                    </div>

                    <div className="relative flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHovered(null)} aria-hidden="true">
                        {data.map((point, index) => {
                            const isLast = index === data.length - 1;

                            return (
                                <div key={point.date} onMouseEnter={() => setHovered(index)} className="flex h-full flex-1 items-end">
                                    <span
                                        className={`w-full rounded-t-[4px] transition-colors ${
                                            isLast || hovered === index ? 'bg-brand-500' : 'bg-brand-500/55'
                                        }`}
                                        style={{ height: `${(point.value / max) * 100}%`, minHeight: point.value > 0 ? 2 : 0 }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {active && (
                        <div
                            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control border border-gray-100 bg-surface px-3 py-1.5 text-xs shadow-lift"
                            style={{ left: `${((hovered + 0.5) / data.length) * 100}%` }}
                        >
                            <span className="text-gray-500" dir="rtl">
                                {formatShortDay(active.date)}
                            </span>{' '}
                            <b className="font-display text-gray-900">{formatValue(active.value)}</b>
                        </div>
                    )}

                    <div className="mt-2 flex text-[12px] text-gray-400" aria-hidden="true">
                        {data.map((point, index) => (
                            <span key={point.date} className="flex-1 whitespace-nowrap text-center" dir="rtl">
                                {index % labelEvery === 0 || index === data.length - 1 ? formatShortDay(point.date) : ''}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <table className="sr-only">
                <caption>{label}</caption>
                <tbody>
                    {data.map((point) => (
                        <tr key={point.date}>
                            <th scope="row">{formatShortDay(point.date)}</th>
                            <td>{formatValue(point.value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}
