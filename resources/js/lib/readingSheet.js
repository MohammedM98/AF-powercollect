export function readingStatusFilters(status) {
    return { entry: status === 'missing' ? 'missing' : '', approval: ['pending', 'approved'].includes(status) ? status : '' };
}

export function activeReadingStatus(filters) {
    if (filters.approval === 'pending' || filters.approval === 'approved') {
        return filters.entry === 'missing' ? null : filters.approval;
    }

    if (filters.entry === 'missing') {
        return 'missing';
    }

    return filters.entry === 'entered' ? null : 'all';
}
