import { roundToCents } from './currency.js';

/**
 * The kWh used between two meter readings, rounded to the two decimal places
 * readings are kept to. Mirrors MeterReading::consumptionBetween().
 */
export function consumptionBetween(previousReading, currentReading) {
    return Math.round((Number(currentReading) - Number(previousReading)) * 100) / 100;
}

/**
 * What a standing discount (`{ method, value }`) takes off a week's reading
 * fee, in shekels: a percentage of the fee, kilowatts of the consumption at
 * the kilo price, or shekels off the price of each kilo — never more than
 * the fee. Mirrors MeterReading::discountFor().
 */
export function readingDiscount(discount, consumption, unitPrice) {
    const kilos = Number(consumption);
    const price = Number(unitPrice);
    const value = Number(discount.value);

    if (!(kilos > 0) || !(value > 0)) {
        return 0;
    }

    const readingFee = roundToCents(kilos * price);
    const amount = {
        percentage: (readingFee * value) / 100,
        kilowatt: Math.min(value, kilos) * price,
        shekel: kilos * Math.min(value, price),
    }[discount.method];

    return Math.min(roundToCents(amount ?? 0), readingFee);
}

/**
 * What a week's consumption costs: consumption × kilo price, less the
 * standing discount if there is one, but never less than the minimum
 * payment. `discountAmount` is what the discount took off the week's bill
 * and `minimumApplies` whether the minimum payment is what is due.
 * Mirrors MeterReading::chargesFor().
 */
export function weeklyCharges(consumption, unitPrice, minimumPayment, discount = null) {
    const readingFee = roundToCents(Number(consumption) * Number(unitPrice));
    const discountedFee = roundToCents(readingFee - (discount ? readingDiscount(discount, consumption, unitPrice) : 0));
    const minimum = Number(minimumPayment);
    const amountDue = Math.max(discountedFee, minimum);

    return {
        readingFee,
        discountAmount: roundToCents(Math.max(readingFee, minimum) - amountDue),
        amountDue,
        minimumApplies: discountedFee < minimum,
    };
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
