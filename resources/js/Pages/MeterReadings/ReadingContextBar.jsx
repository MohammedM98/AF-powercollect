import { useEffect, useState } from 'react';
import Icon from '@/Components/Icon';
import { activeFilterChips } from '@/lib/readingSheet';

/** How far below the top of the window the pinned bar sits: under the app's own floating bar. */
const TOP_OFFSET = 74;

const shortDate = (date) => (date ? date.slice(5).split('-').reverse().join('/') : '');

/**
 * While the sheet's filters are scrolled out of sight, a slim bar pinned
 * under the app's bar says where the readings being entered belong: the
 * week, then each filter set (branch, area, sub-area, meter box…) and the
 * search, with how many subscribers match. "تغيير الفلاتر" scrolls back to
 * the filters. `anchorRef` marks the end of the filters, `sectionRef` is
 * the sheet: the bar shows once the filters pass under the app's bar, and
 * leaves again once the sheet itself has scrolled by.
 */
export default function ReadingContextBar({ anchorRef, sectionRef, week, weekEnd, groups, values, search, total }) {
    const [shown, setShown] = useState(false);
    const chips = activeFilterChips(groups, values, search);

    useEffect(() => {
        let frame = null;

        function measure() {
            frame = null;
            const anchor = anchorRef.current?.getBoundingClientRect();
            const section = sectionRef.current?.getBoundingClientRect();

            setShown(Boolean(anchor && section) && anchor.bottom < TOP_OFFSET && section.bottom > TOP_OFFSET + 120);
        }

        function onScroll() {
            frame ??= window.requestAnimationFrame(measure);
        }

        measure();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);

        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);

            if (frame !== null) {
                window.cancelAnimationFrame(frame);
            }
        };
    }, [anchorRef, sectionRef]);

    function showFilters() {
        const top = (sectionRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - TOP_OFFSET - 12;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    }

    return (
        <div className={`re-context ${shown ? 'is-shown' : ''}`} style={{ top: TOP_OFFSET }} aria-hidden={!shown} inert={!shown}>
            <div className="re-context-bar" role="status" aria-label="ما تُدخل له القراءات الآن">
                <span className="re-context-week">
                    <Icon name="calendar" className="h-4 w-4" />
                    <bdi dir="ltr">{shortDate(week)} – {shortDate(weekEnd)}</bdi>
                </span>
                <div className="re-context-chips">
                    {chips.length === 0 ? (
                        <span className="re-context-chip is-all">كل المشتركين</span>
                    ) : (
                        chips.map((chip) => (
                            <span key={chip.key} className="re-context-chip">
                                <small>{chip.label}</small>
                                {chip.value}
                            </span>
                        ))
                    )}
                </div>
                <span className="re-context-count"><b>{Number(total ?? 0).toLocaleString('en')}</b> مشترك</span>
                <button type="button" className="re-context-edit" onClick={showFilters}>
                    <Icon name="filter" className="h-4 w-4" />
                    تغيير الفلاتر
                </button>
            </div>
        </div>
    );
}
