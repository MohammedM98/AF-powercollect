export default function InputError({ message, className = '' }) {
    if (!message) {
        return null;
    }

    return <p className={`text-xs text-danger-ink ${className}`}>{message}</p>;
}
