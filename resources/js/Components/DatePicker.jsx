import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import FieldPopover from '@/Components/FieldPopover';
import SelectInput from '@/Components/SelectInput';
import { calendarDays, displayDate, inDateBounds, parseDateInput, shiftMonth } from '@/lib/datePicker';

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** Consistent calendar and manual entry; submitted dates keep their original ISO format. */
export default forwardRef(function DatePicker({ type = 'date', value = '', onChange, className = '', id, name, min, max, required, disabled, readOnly, ...props }, ref) {
    const root = useRef(null);
    const field = useRef(null);
    const nativeField = useRef(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(() => displayDate(value));
    const [error, setError] = useState('');
    const today = new Date().toLocaleDateString('en-CA');
    const [month, setMonth] = useState((value || today).slice(0, 7));
    const time = value?.slice(11) || '00:00';
    const close = useCallback((restore) => { setOpen(false); if (restore) field.current?.focus(); }, []);

    useEffect(() => { setDraft(displayDate(value)); setError(''); nativeField.current?.setCustomValidity(''); }, [value]);

    function change(next) {
        const valid = next === '' || inDateBounds(next, min, max);
        if (!valid) return false;
        setDraft(displayDate(next));
        setError('');
        nativeField.current?.setCustomValidity('');
        onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } });
        return true;
    }

    function edit(text) {
        setDraft(text);
        const next = parseDateInput(text, type);
        const valid = next !== null && (next === '' || inDateBounds(next, min, max));
        const message = valid ? '' : 'أدخل تاريخًا صحيحًا ضمن الفترة المسموحة.';
        setError(message);
        nativeField.current?.setCustomValidity(message);
        if (valid) onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } });
    }

    function pick(day) {
        if (change(type === 'datetime-local' ? `${day}T${time}` : day) && type === 'date') close(true);
    }

    return <div ref={root} className={`date-picker relative min-w-0 ${className}`}>
        <div className="date-picker-field flex min-h-11 items-center rounded-control border border-gray-200 bg-surface focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10">
            <input {...props} id={id} ref={(element) => { field.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element; }} type="text" value={draft} onChange={(event) => edit(event.target.value)} disabled={disabled} readOnly={readOnly} aria-invalid={Boolean(error)} dir="ltr" placeholder={type === 'date' ? 'DD/MM/YYYY' : 'DD/MM/YYYY HH:mm'} className="!min-w-0 !w-full flex-1 !border-0 !bg-transparent !px-3 !py-2.5 font-display text-sm !shadow-none !ring-0" />
            <button type="button" disabled={disabled || readOnly} aria-label="اختيار التاريخ" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setMonth((value || today).slice(0, 7)); setOpen(!open); }} className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-control text-gray-600 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"><Icon name="calendar" className="h-5 w-5" /></button>
        </div>
        <input ref={nativeField} type={type} value={value || ''} name={name} min={min} max={max} required={required} disabled={disabled} readOnly={readOnly} onChange={() => {}} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" onInvalid={(event) => { event.preventDefault(); setError(event.currentTarget.validationMessage); field.current?.focus(); }} />
        {error && <p className="mt-1 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
        {open && <FieldPopover anchor={root.current} onClose={close} label="اختيار التاريخ">
            <div className="mb-3 flex items-center gap-2">
                <button type="button" aria-label="الشهر السابق" disabled={month === '0001-01'} onClick={() => setMonth(shiftMonth(month, -1))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-gray-100"><Icon name="chevron-right" className="h-5 w-5" /></button>
                <SelectInput aria-label="الشهر" value={month.slice(5)} onChange={(event) => setMonth(`${month.slice(0, 4)}-${event.target.value}`)} className="flex-1">{MONTHS.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}</SelectInput>
                <input aria-label="السنة" type="number" min="1" max="9999" value={Number(month.slice(0, 4))} onChange={(event) => { const year = Number(event.target.value); if (year >= 1 && year <= 9999) setMonth(`${String(year).padStart(4, '0')}-${month.slice(5)}`); }} className="w-20 rounded-xl border-gray-200 bg-surface px-2 py-2 text-center text-sm" />
                <button type="button" aria-label="الشهر التالي" disabled={month === '9999-12'} onClick={() => setMonth(shiftMonth(month, 1))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-gray-100"><Icon name="chevron-left" className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">{WEEKDAYS.map((day) => <span key={day} className="py-2 text-center text-xs font-semibold text-gray-500">{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">{calendarDays(month).map((day) => <button key={day} type="button" data-autofocus={day === (value || today).slice(0, 10) || undefined} aria-label={displayDate(day)} aria-pressed={day === value?.slice(0, 10)} disabled={day < '0001-01-01' || day > '9999-12-31' || !inDateBounds(day, min?.slice(0, 10), max?.slice(0, 10))} onClick={() => pick(day)} className={`flex h-10 items-center justify-center rounded-xl font-display text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 disabled:opacity-25 ${day === value?.slice(0, 10) ? 'bg-brand-600 font-bold text-white' : day.slice(0, 7) === month ? 'text-gray-900 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-50'}`}>{Number(day.slice(8))}</button>)}</div>
            {type === 'datetime-local' && <label className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3 text-sm">الوقت<input type="time" aria-label="الوقت" value={time} onChange={(event) => { if (value?.slice(0, 10) && event.target.value) change(`${value.slice(0, 10)}T${event.target.value}`); }} className="rounded-xl border-gray-200 bg-surface px-3 py-2" /></label>}
            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                <button type="button" disabled={!inDateBounds(today, min?.slice(0, 10), max?.slice(0, 10))} onClick={() => pick(today)} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">اليوم</button>
                {!required && <button type="button" onClick={() => { change(''); close(true); }} className="min-h-10 rounded-xl px-3 text-sm text-gray-600 hover:bg-gray-50">مسح التاريخ</button>}
                <button type="button" onClick={() => close(true)} className="min-h-10 rounded-xl bg-gray-100 px-3 text-sm font-semibold">تم</button>
            </div>
        </FieldPopover>}
    </div>;
});
