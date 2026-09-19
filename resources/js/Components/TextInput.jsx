export default function TextInput({ className = '', ...props }) {
    return (
        <input
            {...props}
            className={`block rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 ${className}`}
        />
    );
}
