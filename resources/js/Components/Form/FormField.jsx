import { cloneElement } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';

/**
 * One labelled field of a form: its label (with a red star when required),
 * the control (given the field's id), an optional hint under it and the
 * error the server found. `span` is a grid class to make it wider.
 */
export default function FormField({ id, label, required, error, hint, span = '', children }) {
    return (
        <div className={span}>
            <InputLabel htmlFor={id}>
                {label}
                {required && <span className="text-red-500"> *</span>}
            </InputLabel>
            <div className="mt-1">{cloneElement(children, { id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) })}</div>
            {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">{hint}</p>}
            <InputError message={error} className="mt-1" />
        </div>
    );
}
