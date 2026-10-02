<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Changes applied to many subscribers at once from the subscribers
     * list (their minimum charge, their status), kept with each
     * subscriber's value before and after, so a change can be reviewed
     * and undone. The branch is empty when a Super Admin changed
     * subscribers of several branches.
     */
    public function up(): void
    {
        Schema::create('subscriber_bulk_changes', function (Blueprint $table): void {
            $table->id();
            $table->string('field');
            $table->string('value')->nullable();
            $table->string('description');
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('changed_count')->default(0);
            $table->timestamp('undone_at')->nullable();
            $table->foreignId('undone_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('restored_count')->nullable();
            $table->timestamps();
        });

        Schema::create('subscriber_bulk_change_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('subscriber_bulk_change_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscriber_id')->constrained()->cascadeOnDelete();
            $table->string('old_value')->nullable();
            $table->string('new_value')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriber_bulk_change_items');
        Schema::dropIfExists('subscriber_bulk_changes');
    }
};
