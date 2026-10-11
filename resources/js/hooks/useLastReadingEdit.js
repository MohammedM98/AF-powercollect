import { useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { steppedReading } from '@/lib/readings';

/**
 * Editing a subscription's last reading in place — the reading of the week
 * before the latest — on the readings sheet and in a subscription's reading
 * history. `open()` (the pencil) turns it into a field with − and +, which
 * step it a kilo between where its own week started (`floor`) and the reading
 * of the week after it (`ceiling`, once that week is entered). Enter or
 * leaving the field saves it, Escape puts it back. The week after it is
 * recalculated from it, so when `needsConfirmation` (either reading is
 * approved) saving waits on "are you sure?" (`confirming`, then `confirm()`
 * or `cancel()`).
 *
 * Returns the state (`editing`, `value`, `error`, `saving`, `confirming`),
 * the actions, and `inputProps` to spread on the field.
 */
export function useLastReadingEdit({ readingId, savedValue, floor, ceiling = null, needsConfirmation = false }) {
    const saved = String(savedValue);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(saved);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    // Set while a save is on its way, and once the field is left with Escape: its blur then saves nothing.
    const busy = useRef(false);
    const inputRef = useRef(null);

    function open() {
        busy.current = false;
        setValue(saved);
        setError(null);
        setEditing(true);
    }

    function close() {
        busy.current = true;
        setEditing(false);
        setConfirming(false);
        setError(null);
        setValue(saved);
    }

    function step(direction) {
        setValue((current) => steppedReading(current, floor, direction, ceiling));
        setError(null);
        inputRef.current?.focus();
    }

    function save({ confirmed = false } = {}) {
        if (busy.current) {
            return;
        }

        if (value === '' || Number.isNaN(Number(value)) || Number(value) === Number(saved)) {
            close();
            return;
        }

        if (needsConfirmation && !confirmed) {
            setConfirming(true);
            return;
        }

        busy.current = true;
        router.put(`/meter-readings/${readingId}`, { current_reading: value }, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
            onSuccess: () => {
                setEditing(false);
                setError(null);
            },
            onError: (errors) => {
                busy.current = false;
                setError(Object.values(errors)[0] ?? 'تعذّر حفظ آخر قراءة.');
            },
        });
    }

    const inputProps = {
        ref: inputRef,
        type: 'number',
        inputMode: 'decimal',
        step: '0.01',
        min: floor,
        max: ceiling ?? undefined,
        dir: 'ltr',
        autoFocus: true,
        value,
        disabled: saving,
        'aria-invalid': Boolean(error),
        // The reason shows as a flash message when the save fails, and on hover here: the row never grows.
        title: error ?? undefined,
        onFocus: (event) => event.target.select(),
        onChange: (event) => {
            setValue(event.target.value);
            setError(null);
        },
        onBlur: () => !confirming && save(),
        onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                save();
            } else if (event.key === 'Escape') {
                // Escape only puts the reading back; the window around it stays open.
                event.preventDefault();
                event.stopPropagation();
                close();
            } else if ((event.key === '+' || event.key === '-') && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // The + and − keys step the reading like the buttons, instead of typing a sign.
                event.preventDefault();
                step(event.key === '+' ? 1 : -1);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                // The field's own 0.01 stepping is switched off: the arrows never change the number.
                event.preventDefault();
            }
        },
    };

    return {
        editing,
        value,
        error,
        saving,
        confirming,
        open,
        close,
        step,
        confirm: () => {
            setConfirming(false);
            save({ confirmed: true });
        },
        cancel: close,
        canStepDown: !saving && value !== '' && Number(value) > Number(floor),
        canStepUp: !saving && (ceiling === null || value === '' || Number(value) < Number(ceiling)),
        inputProps,
    };
}
