import { useRef, useState } from 'react';
import { router, useHttp } from '@inertiajs/react';
import { steppedReading } from '@/lib/readings';

/**
 * Editing a subscription's last reading in place — the reading of the week
 * before the latest — on the readings sheet and in a subscription's reading
 * history. `open()` (the pencil) turns it into a field with − and +, which
 * step it a kilo between where its own week started (`floor`) and the reading
 * of the week after it (`ceiling`, once that week is entered). Enter or
 * leaving the field saves it, Escape puts it back. The week after it is
 * recalculated from it, so when `needsConfirmation` (either reading is
 * approved) saving first loads what the edit does to both weeks (`preview`,
 * worked out by the server) and waits on "are you sure?" (`confirming`, then
 * `confirm({ confirmUnusual })` or `cancel()`). Confirmed, the edit is saved
 * and the approved week(s) approved again at once (`as_last_reading`).
 *
 * Returns the state (`editing`, `value`, `error`, `saving`, `confirming`,
 * `preview`), the actions, and `inputProps` to spread on the field.
 */
export function useLastReadingEdit({ readingId, savedValue, floor, ceiling = null, needsConfirmation = false }) {
    const saved = String(savedValue);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(saved);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [preview, setPreview] = useState(null);
    const previewRequest = useHttp({ current_reading: '' });
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
        setPreview(null);
        setError(null);
        setValue(saved);
    }

    /** Loads what the edit would do to both weeks, then asks "are you sure?" with it. */
    function askToConfirm() {
        busy.current = true;
        setSaving(true);
        previewRequest.transform(() => ({ current_reading: value }));
        previewRequest
            .post(`/meter-readings/${readingId}/last-reading-preview`, {
                onError: (errors) => setError(errors.current_reading ?? Object.values(errors)[0] ?? 'تعذّر حساب التعديل.'),
            })
            .then((loaded) => {
                if (loaded) {
                    setPreview(loaded);
                    setConfirming(true);
                }
            })
            .catch(() => setError('تعذّر حساب التعديل؛ حاول مرة أخرى.'))
            .finally(() => {
                busy.current = false;
                setSaving(false);
            });
    }

    function step(direction) {
        setValue((current) => steppedReading(current, floor, direction, ceiling));
        setError(null);
        inputRef.current?.focus();
    }

    function save({ confirmed = false, confirmUnusual = false } = {}) {
        if (busy.current) {
            return;
        }

        if (value === '' || Number.isNaN(Number(value)) || Number(value) === Number(saved)) {
            close();
            return;
        }

        if (needsConfirmation && !confirmed) {
            askToConfirm();
            return;
        }

        busy.current = true;
        router.put(`/meter-readings/${readingId}`, { current_reading: value, as_last_reading: true, confirm_unusual: confirmUnusual }, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
            onSuccess: () => {
                setEditing(false);
                setConfirming(false);
                setPreview(null);
                setError(null);
            },
            onError: (errors) => {
                busy.current = false;
                setConfirming(false);
                setError(Object.values(errors)[0] ?? 'تعذّر حفظ القراءة السابقة.');
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
        preview,
        open,
        close,
        step,
        confirm: ({ confirmUnusual = false } = {}) => save({ confirmed: true, confirmUnusual }),
        cancel: close,
        canStepDown: !saving && value !== '' && Number(value) > Number(floor),
        canStepUp: !saving && (ceiling === null || value === '' || Number(value) < Number(ceiling)),
        inputProps,
    };
}
