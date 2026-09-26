<?php

use App\Enums\MeterReadingStatus;
use App\Models\MeterReading;
use App\Models\Subscriber;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Readings waiting for approval now follow the subscriber's current kilo
     * price and minimum. Bring the ones entered before that up to date;
     * approved readings keep the prices they were charged at.
     */
    public function up(): void
    {
        Subscriber::query()
            ->whereHas('meterReadings', fn ($reading) => $reading->where('status', MeterReadingStatus::Pending))
            ->each(fn (Subscriber $subscriber) => MeterReading::repricePendingFor($subscriber));
    }

    /**
     * The earlier prices aren't kept, so there is nothing to restore.
     */
    public function down(): void
    {
        //
    }
};
