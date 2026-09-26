export default function InputLabel({ value, className = '', children, ...props }) {
    return (
        <label {...props} className={`block text-[14.5px] font-semibold text-gray-700 ${className}`}>
            {value ?? children}
        </label>
    );
}
