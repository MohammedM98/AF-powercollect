export default function InputError({ message, className = '' }) {
    if (!message) {
        return null;
    }

    return <p className={`text-[12.5px] text-brand-600 ${className}`}>{message}</p>;
}
