/**
 * The kWh used between two meter readings, rounded to the two decimal places
 * readings are kept to. Mirrors MeterReading::consumptionBetween().
 */
export function consumptionBetween(previousReading, currentReading) {
    return Math.round((Number(currentReading) - Number(previousReading)) * 100) / 100;
}
