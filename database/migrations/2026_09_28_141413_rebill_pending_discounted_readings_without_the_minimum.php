<?php

use App\Enums\MeterReadingStatus;
use App\Models\MeterReading;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * A subscriber with a standing discount no longer pays the weekly
     * minimum. Readings still waiting for approval were billed with it, so
     * they are billed again; approved readings are already on the accounts
     * and keep their charges.
     */
    public function up(): void
    {
        MeterReading::query()
            ->where('status', MeterReadingStatus::Pending)
            ->whereNotNull('discount_method')
            ->each(fn (MeterReading $reading) => $reading->update(MeterReading::chargesFor(
                (float) $reading->consumption,
                $reading->unit_price,
                $reading->minimum_payment,
                $reading->discount_method,
                $reading->discount_value,
            )));
    }

    /**
     * Nothing to undo: the charges before cannot be told apart.
     */
    public function down(): void
    {
        //
    }
};
