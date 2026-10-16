import { useEffect, useRef, useState } from 'react';
import { router, useHttp } from '@inertiajs/react';
import { steppedReading } from '@/lib/readings';

/**
 * Editing a subscription's last reading in place — the reading of the week
 * before the latest — on the readings sheet and in a subscription's reading
 * history. `open()` (the pencil) turns it into a field with − and +, which
 * step it a kilo from where its own week started (`floor`) up; the week
 * after it bounds nothing, since its reading is typed again. Enter or
 * leaving the field saves it, Escape puts it back. The week after it is
 * recalculated from it, so when `needsConfirmation` (the week after it is
 * entered, or the reading is approved) saving first loads what the edit does
 * to both weeks (`preview`, worked out by the server) and waits on "are you
 * sure?" (`confirming`). There the week after it is typed again by hand
 * (`nextCurrent`, `setNextCurrent`), never kept at the number it had, and
 * the preview follows it (`nextError` when the server refuses it). Then
 * `confirm({ confirmUnusual })` saves the edit with that reading and
 * approves the approved week(s) again at once (`as_last_reading`), or
 * `cancel()` puts it back.
 *
 * Returns the state (`editing`, `value`, `error`, `saving`, `confirming`,
 * `preview`, `previewing`, `nextCurrent`, `nextError`), the actions, and
 * `inputProps` to spread on the field.
 */
export function useLastReadingEdit({ readingId, savedValue, floor, needsConfirmation = false }) {
    const saved = String(savedValue);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(saved);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [nextCurrent, setNextCurrent] = useState('');
    const [nextError, setNextError] = useState(null);
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
        setNextCurrent('');
        setNextError(null);
        setError(null);
        setValue(saved);
    }

    /** Asks the server what the edit does to both weeks, with this week's reading as typed again so far. */
    function loadPreview(nextReading) {
        previewRequest.transform(() => ({ current_reading: value, next_current_reading: nextReading === '' ? null : nextReading }));

        return previewRequest.post(`/meter-readings/${readingId}/last-reading-preview`, {
            onError: (errors) => {
                if (errors.next_current_reading) {
                    setNextError(errors.next_current_reading);
                } else {
                    setError(errors.current_reading ?? Object.values(errors)[0] ?? 'تعذّر حساب التعديل.');
                }
            },
        });
    }

    /** Loads what the edit would do to both weeks, then asks "are you sure?" with it. */
    function askToConfirm() {
        busy.current = true;
        setSaving(true);
        setNextCurrent('');
        setNextError(null);
        loadPreview('')
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

    // This week's reading typed again in the window: the preview follows it once typing pauses.
    useEffect(() => {
        if (!confirming || nextCurrent === '' || Number.isNaN(Number(nextCurrent))) {
            return undefined;
        }

        setPreviewing(true);
        setNextError(null);
        const timer = setTimeout(() => {
            loadPreview(nextCurrent)
                .then((loaded) => loaded && setPreview(loaded))
                .catch(() => setNextError('تعذّر حساب قراءة هذا الأسبوع؛ حاول مرة أخرى.'))
                .finally(() => setPreviewing(false));
        }, 350);

        return () => {
            clearTimeout(timer);
            previewRequest.cancel();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nextCurrent, confirming]);

    function step(direction) {
        setValue((current) => steppedReading(current, floor, direction));
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
        router.put(`/meter-readings/${readingId}`, { current_reading: value, next_current_reading: nextCurrent === '' ? null : nextCurrent, as_last_reading: true, confirm_unusual: confirmUnusual }, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
            onSuccess: () => {
                setEditing(false);
                setConfirming(false);
                setPreview(null);
                setNextCurrent('');
                setError(null);
            },
            onError: (errors) => {
                busy.current = false;

                // A refused reading for this week stays in the window to be typed again; asked for without
                // the window (this week was entered meanwhile), the window opens for it. Anything else closes it.
                if (errors.next_current_reading && Object.keys(errors).length === 1) {
                    if (confirmed) {
                        setNextError(errors.next_current_reading);
                    } else {
                        askToConfirm();
                    }

                    return;
                }

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
        previewing,
        nextCurrent,
        nextError,
        setNextCurrent: (reading) => {
            setNextCurrent(reading);
            setNextError(null);
        },
        open,
        close,
        step,
        confirm: ({ confirmUnusual = false } = {}) => save({ confirmed: true, confirmUnusual }),
        cancel: close,
        canStepDown: !saving && value !== '' && Number(value) > Number(floor),
        canStepUp: !saving,
        inputProps,
    };
}
