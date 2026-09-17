@props(['percent' => 0, 'color' => 'text-brand-500'])

<div {{ $attributes->merge(['class' => 'relative h-16 w-16 shrink-0']) }}>
    <svg class="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" stroke-width="3" class="text-gray-100"></circle>
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
                stroke-dasharray="{{ min(100, max(0, $percent)) }} 100" class="{{ $color }}"></circle>
    </svg>
    <div class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{{ round($percent) }}%</div>
</div>
