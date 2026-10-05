<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations. A subscriber who has been active — now, or
     * judging by their weekly readings — gets the date they were first
     * activated, so one who was never active can be told from one who was.
     */
    public function up(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->timestamp('activated_at')->nullable()->after('subscription_date');
        });

        DB::table('subscribers')
            ->whereNull('activated_at')
            ->where(function ($query): void {
                $query->where('status', 'active')
                    ->orWhereExists(fn ($readings) => $readings->selectRaw('1')->from('meter_readings')->whereColumn('meter_readings.subscriber_id', 'subscribers.id'));
            })
            ->update(['activated_at' => DB::raw('COALESCE(subscription_date, created_at)')]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscribers', function (Blueprint $table) {
            $table->dropColumn('activated_at');
        });
    }
};
