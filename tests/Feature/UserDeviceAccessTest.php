<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\MobileAccessToken;
use App\Models\User;
use App\Support\UserDeviceAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class UserDeviceAccessTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{username: string, password: string} */
    private function credentials(User $user): array
    {
        return ['username' => $user->username, 'password' => 'password'];
    }

    private function anotherBrowser(): void
    {
        Auth::guard('web')->logoutCurrentDevice();
        $id = Str::random(40);
        session()->setId($id);
        session()->replace([]);
        $this->withCookie(config('session.cookie'), $id);
        Auth::forgetGuards();
    }

    public function test_even_a_super_admin_cannot_open_a_second_mobile_device_and_the_first_remains_connected(): void
    {
        $user = User::factory()->superAdmin()->create();
        $first = $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk()->json('token');
        $this->postJson(route('mobile.login'), [...$this->credentials($user), 'device_id' => 'claimed-same-device'])->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->assertDatabaseCount('mobile_access_tokens', 1);
        $this->withHeader('Authorization', 'Bearer '.$first)->getJson(route('mobile.me'))->assertOk()->assertJsonPath('user.id', $user->id);
        $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk()->assertJsonPath('token', $first);
        $this->postJson(route('mobile.logout'))->assertOk();
        $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk();
        $this->assertDatabaseCount('mobile_access_tokens', 1);
    }

    public function test_a_second_browser_is_refused_without_ending_the_original_browser_session(): void
    {
        $user = User::factory()->superAdmin()->create();
        $this->post(route('login'), $this->credentials($user))->assertSessionHasNoErrors();
        $firstId = session()->getId();
        $this->anotherBrowser();
        $this->post(route('login'), $this->credentials($user))->assertSessionHasErrors('username');
        $this->assertGuest();
        $this->assertDatabaseCount('user_login_devices', 1);
        $this->assertDatabaseHas('user_login_devices', ['user_id' => $user->id, 'session_hash' => hash('sha256', $firstId)]);
        Auth::forgetGuards();
        $this->withCookie(config('session.cookie'), $firstId)->get(route('dashboard'))->assertOk();
        $this->assertAuthenticatedAs($user);
    }

    public function test_the_configured_limit_is_shared_between_the_website_and_mobile_and_logout_releases_a_slot(): void
    {
        $user = User::factory()->superAdmin()->create(['max_devices' => 2]);
        $this->post(route('login'), $this->credentials($user))->assertSessionHasNoErrors();
        $token = $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk()->json('token');
        $this->postJson(route('mobile.login'), $this->credentials($user))->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->assertSame(2, app(UserDeviceAccess::class)->activeCount($user));
        $this->withHeader('Authorization', 'Bearer '.$token)->postJson(route('mobile.logout'))->assertOk();
        $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk();
        $this->assertSame(2, app(UserDeviceAccess::class)->activeCount($user));
    }

    public function test_expired_browser_and_mobile_sessions_do_not_block_a_new_login(): void
    {
        $user = User::factory()->create();
        $token = MobileAccessToken::issue($user);
        MobileAccessToken::query()->where('token_hash', hash('sha256', $token))->update(['expires_at' => now()->subMinute()]);
        DB::table('user_login_devices')->insert(['user_id' => $user->id, 'session_hash' => hash('sha256', 'expired-session'), 'expires_at' => now()->subMinute(), 'created_at' => now()->subDay(), 'updated_at' => now()->subDay()]);
        $this->postJson(route('mobile.login'), $this->credentials($user))->assertOk();
        $this->assertSame(1, app(UserDeviceAccess::class)->activeCount($user));
    }

    public function test_revoking_devices_cannot_be_undone_by_a_stale_browser_session(): void
    {
        $user = User::factory()->superAdmin()->create();
        $this->post(route('login'), $this->credentials($user))->assertSessionHasNoErrors();
        $id = session()->getId();
        app(UserDeviceAccess::class)->revokeAll($user);
        Auth::forgetGuards();
        $this->withCookie(config('session.cookie'), $id)->getJson(route('dashboard'))->assertUnauthorized();
        $this->assertDatabaseCount('user_login_devices', 0);
        $this->assertGuest();
    }

    public function test_managers_can_change_the_limit_and_revoke_lost_devices_with_existing_password_management_permissions(): void
    {
        $target = User::factory()->create(['max_devices' => 2]);
        MobileAccessToken::issue($target);
        MobileAccessToken::issue($target);
        $admin = User::factory()->superAdmin()->create();
        $data = ['name' => $target->name, 'username' => $target->username, 'branch_id' => $target->branch_id, 'max_devices' => 1];
        $this->actingAs($admin)->put(route('users.update', $target), $data)->assertSessionHasErrors('max_devices');
        $this->assertSame(2, $target->fresh()->max_devices);
        $this->put(route('users.update', $target), [...$data, 'reset_devices' => true])->assertSessionHasNoErrors();
        $this->assertSame(1, $target->fresh()->max_devices);
        $this->assertSame(0, app(UserDeviceAccess::class)->activeCount($target));
        $this->assertDatabaseCount('mobile_access_tokens', 0);
        $this->put(route('users.update', $target), [...$data, 'max_devices' => 0])->assertSessionHasErrors('max_devices');
    }

    public function test_editing_names_does_not_allow_changing_device_limits_without_password_management_permission(): void
    {
        $target = User::factory()->collector()->create();
        $actor = User::factory()->collector()->for($target->branch)->withPermissions([PermissionKey::ViewUsers, PermissionKey::UpdateUsers])->create();
        MobileAccessToken::issue($target);
        $this->actingAs($actor)->put(route('users.update', $target), ['name' => 'Updated Name', 'username' => $target->username, 'max_devices' => 20, 'reset_devices' => true])->assertSessionHasNoErrors();
        $this->assertSame(1, $target->fresh()->max_devices);
        $this->assertSame('Updated Name', $target->fresh()->name);
        $this->assertDatabaseCount('mobile_access_tokens', 1);
    }

    public function test_existing_recent_browser_access_is_kept_over_an_idle_legacy_mobile_session(): void
    {
        $user = User::factory()->superAdmin()->create();
        $this->post(route('login'), $this->credentials($user))->assertSessionHasNoErrors();
        $id = session()->getId();
        $token = MobileAccessToken::issue($user);
        MobileAccessToken::query()->where('token_hash', hash('sha256', $token))->update(['created_at' => now()->subHours(2), 'last_used_at' => now()->subHour()]);
        Auth::forgetGuards();
        $this->withCookie(config('session.cookie'), $id)->get(route('dashboard'))->assertOk();
        $this->assertAuthenticatedAs($user);
        $this->withHeader('Authorization', 'Bearer '.$token)->getJson(route('mobile.me'))->assertUnauthorized();
        $this->assertDatabaseCount('mobile_access_tokens', 0);
    }
}
