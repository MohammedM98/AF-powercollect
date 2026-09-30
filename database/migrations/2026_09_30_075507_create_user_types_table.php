<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_types', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('user_type_id')->nullable()->constrained()->restrictOnDelete();
        });

        foreach (['view' => 'View User Types', 'create' => 'Add User Types', 'update' => 'Edit User Types', 'delete' => 'Delete User Types'] as $action => $label) {
            DB::table('permissions')->insertOrIgnore([
                'key' => 'user_types.'.$action,
                'label' => $label,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('user_type_id');
        });

        Schema::dropIfExists('user_types');
        DB::table('permissions')->whereIn('key', ['user_types.view', 'user_types.create', 'user_types.update', 'user_types.delete'])->delete();
    }
};
