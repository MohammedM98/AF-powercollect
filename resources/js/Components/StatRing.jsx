export default function StatRing({ percent = 0, color = 'text-brand-500' }) {
    const clamped = Math.min(100, Math.max(0, percent));

    return (
        <div className="relative h-16 w-16 shrink-0">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-100" />
                <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${clamped} 100`}
                    className={color}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{Math.round(percent)}%</div>
        </div>
    );
}
