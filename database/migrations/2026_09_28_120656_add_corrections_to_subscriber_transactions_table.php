<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Let a line be corrected or deleted without touching what it says: it
     * is marked cancelled — by whom, when and why — and a reversal line
     * (`reverses_id`) takes its amount back off the balance. A correction
     * then records the right line, which points back with `corrects_id`.
     */
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->foreignId('reverses_id')->nullable()->after('meter_reading_id')->constrained('subscriber_transactions')->restrictOnDelete();
            $table->foreignId('corrects_id')->nullable()->after('reverses_id')->constrained('subscriber_transactions')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('notes');
            $table->foreignId('cancelled_by')->nullable()->after('cancelled_at')->constrained('users')->restrictOnDelete();
            $table->string('cancellation_reason')->nullable()->after('cancelled_by');
            $table->text('cancellation_notes')->nullable()->after('cancellation_reason');
        });
    }

    /**
     * Reverse the migrations. Reversal lines mean nothing without the
     * cancellations they belong to, so they go too.
     */
    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('corrects_id');
        });

        DB::table('subscriber_transactions')->whereNotNull('reverses_id')->delete();

        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reverses_id');
            $table->dropConstrainedForeignId('cancelled_by');
            $table->dropColumn(['cancelled_at', 'cancellation_reason', 'cancellation_notes']);
        });
    }
};
