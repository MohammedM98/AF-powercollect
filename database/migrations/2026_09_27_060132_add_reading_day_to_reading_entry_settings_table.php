<?php

use Carbon\CarbonInterface;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The weekly reading day (a Carbon day-of-week number), Thursday as
     * before, and the days it was moved from, so weeks already read keep
     * their dates.
     */
    public function up(): void
    {
        Schema::table('reading_entry_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('reading_day')->default(CarbonInterface::THURSDAY)->after('open_days');
            $table->json('reading_day_history')->nullable()->after('reading_day');
        });
    }

    /**
     * Weeks go back to always ending on Thursday; a changed reading day and
     * its history are lost.
     */
    public function down(): void
    {
        Schema::table('reading_entry_settings', function (Blueprint $table) {
            $table->dropColumn(['reading_day', 'reading_day_history']);
        });
    }
};
