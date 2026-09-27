/**
 * The kWh used between two meter readings, rounded to the two decimal places
 * readings are kept to. Mirrors MeterReading::consumptionBetween().
 */
export function consumptionBetween(previousReading, currentReading) {
    return Math.round((Number(currentReading) - Number(previousReading)) * 100) / 100;
}

/**
 * A subscriber row of the subscribers list as the reading form's
 * `fixedSubscriber`: who it is and the reading the new week starts from.
 */
export function readingOptionFor(subscriber) {
    return {
        value: String(subscriber.id),
        label: `${subscriber.account_number} — ${subscriber.full_name}`,
        lastReading: subscriber.lastReading,
        lastWeekStart: subscriber.lastReadingWeekStart,
    };
}

/**
 * Whether the subscriber's reading for the latest ended week (the first of
 * `weekOptions`) has been entered already.
 */
export function hasLatestWeekReading(subscriber, weekOptions) {
    const latestReading = subscriber.meterReadings?.[0];

    return Boolean(latestReading && latestReading.weekStart === weekOptions[0]?.value);
}
