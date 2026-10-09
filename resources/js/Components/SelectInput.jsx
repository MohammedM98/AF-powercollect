import { useCallback, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import FieldPopover from '@/Components/FieldPopover';
import { selectOptions } from '@/lib/selectOptions';

/** Same controlled value and change contract as a select, with the site's searchable menu. */
export default function SelectInput({ children, value, onChange, className = '', id, name, disabled, required, ...props }) {
    const options = selectOptions(children);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const trigger = useRef(null);
    const chosen = options.find((option) => option.value === String(value ?? ''));
    const label = props['aria-label'] ?? 'اختيار من القائمة';
    const close = useCallback((restore) => {
        setOpen(false);
        setQuery('');
        if (restore) trigger.current?.focus();
    }, []);

    function pick(option) {
        onChange?.({ target: { value: option.value, name }, currentTarget: { value: option.value, name } });
        close(true);
    }

    return <div className={`select-input relative min-w-0 ${className}`}>
        <button {...props} ref={trigger} id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-gray-200 bg-surface px-3 py-2 text-start text-base text-gray-900 hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500">
            <span className="min-w-0 truncate">{chosen?.label ?? options[0]?.label ?? 'اختر'}</span><Icon name="chevron-down" className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
        <select name={name} value={value} onChange={onChange} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" onFocus={() => trigger.current?.focus()}>{children}</select>
        {open && <FieldPopover anchor={trigger.current} onClose={close} role="dialog" label={label} width={Math.max(260, trigger.current.offsetWidth)}>
            <input data-autofocus type="search" aria-label={`بحث في ${label}`} placeholder="ابحث في الخيارات..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    event.currentTarget.nextElementSibling?.querySelector('button:not(:disabled)')?.focus();
                }
            }} className="mb-2 block w-full rounded-xl border-gray-200 bg-gray-50 px-3 py-2 text-base" />
            <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto" onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
                const index = items.indexOf(document.activeElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items[next]?.focus();
            }}>
                {options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())).map((option) => <button type="button" role="option" aria-selected={option.value === String(value)} disabled={option.disabled} key={option.value} onClick={() => pick(option)} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start text-base hover:bg-gray-50 focus:bg-gray-100 focus:outline-none disabled:opacity-40 ${option.value === String(value) ? 'bg-brand-50 font-semibold text-brand-700' : 'text-gray-700'}`}><span>{option.label}</span>{option.value === String(value) && <Icon name="check" className="h-4 w-4 shrink-0" />}</button>)}
                {!options.some((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())) && <p className="p-3 text-sm text-gray-500">لا توجد نتائج</p>}
            </div>
        </FieldPopover>}
    </div>;
}
