export default function TextInput({ className = '', ...props }) {
    return <input {...props} className={`block rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 ${className}`} />;
}
