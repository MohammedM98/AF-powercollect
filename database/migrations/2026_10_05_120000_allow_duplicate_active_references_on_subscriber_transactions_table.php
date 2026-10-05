<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A reference number already on another payment now only asks for
     * confirmation, so it stays searchable but no longer unique.
     */
    public function up(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropUnique(['active_reference']);
            $table->index('active_reference');
        });
    }

    public function down(): void
    {
        Schema::table('subscriber_transactions', function (Blueprint $table) {
            $table->dropIndex(['active_reference']);
            $table->unique('active_reference');
        });
    }
};
