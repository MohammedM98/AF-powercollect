import DatePicker from '@/Components/DatePicker';

/**
 * A text field. Corners, border and the focus ring come from the shared field styles in app.css.
 */
export default function TextInput({ className = '', ...props }) {
    if (props.type === 'date' || props.type === 'datetime-local') {
        return <DatePicker {...props} className={className} />;
    }
    return <input {...props} className={`block ${className}`} />;
}
