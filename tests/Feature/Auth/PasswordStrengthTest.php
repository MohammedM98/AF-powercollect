<?php

namespace Tests\Feature\Auth;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PasswordStrengthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string}>
     */
    public static function weakPasswords(): array
    {
        return [
            'only digits' => ['12345678'],
            'a common word' => ['password'],
            'long but only letters' => ['abcdefghijkl'],
            'long but only digits' => ['1234567890123'],
            'letters and digits but short' => ['abc12345'],
        ];
    }

    #[DataProvider('weakPasswords')]
    public function test_a_weak_password_is_refused_when_creating_a_user(string $password): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)->post(route('users.store'), $this->newUser(['password' => $password, 'password_confirmation' => $password]))
            ->assertSessionHasErrors('password');

        $this->assertDatabaseMissing('users', ['username' => 'new.person']);
    }

    #[DataProvider('weakPasswords')]
    public function test_a_weak_password_is_refused_when_changing_a_users_password(string $password): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $user = User::factory()->collector()->create(['branch_id' => Branch::factory()->create()->id]);

        $this->actingAs($superAdmin)->put(route('users.update', $user), [
            'name' => $user->name, 'username' => $user->username, 'branch_id' => $user->branch_id, 'is_active' => true,
            'password' => $password, 'password_confirmation' => $password,
        ])->assertSessionHasErrors('password');
    }

    #[DataProvider('weakPasswords')]
    public function test_a_weak_password_is_refused_when_changing_your_own(string $password): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->from('/profile')->put('/password', [
            'current_password' => 'password', 'password' => $password, 'password_confirmation' => $password,
        ])->assertSessionHasErrorsIn('updatePassword', 'password');

        $this->assertTrue(password_verify('password', $user->fresh()->password));
    }

    public function test_a_password_of_ten_characters_with_letters_and_numbers_is_accepted_everywhere(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)->post(route('users.store'), $this->newUser(['password' => 'Tulip2026ab', 'password_confirmation' => 'Tulip2026ab']))
            ->assertSessionHasNoErrors();
        $this->from('/profile')->put('/password', ['current_password' => 'password', 'password' => 'Maple2026xy', 'password_confirmation' => 'Maple2026xy'])
            ->assertSessionHasNoErrors();
    }

    public function test_in_production_a_password_found_in_a_known_breach_is_refused_too(): void
    {
        $this->app['env'] = 'production';
        $breached = 'Summer2026ab';
        $hash = strtoupper(sha1($breached));

        Http::fake(['api.pwnedpasswords.com/*' => Http::sequence()
            ->push(substr($hash, 5).":4210\r\n0018A45C4D1DEF81644B54AB7F969B88D65:3")
            ->push('0018A45C4D1DEF81644B54AB7F969B88D65:3')]);

        $this->assertTrue(Validator::make(['password' => $breached], ['password' => Password::default()])->fails());
        $this->assertFalse(Validator::make(['password' => $breached], ['password' => Password::default()])->fails());
    }

    public function test_outside_production_no_outside_service_is_asked(): void
    {
        Http::fake();

        Validator::make(['password' => 'Summer2026ab'], ['password' => Password::default()])->passes();

        Http::assertNothingSent();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function newUser(array $overrides = []): array
    {
        return [
            'name' => 'New Person',
            'username' => 'new.person',
            'role' => 'collector',
            'branch_id' => Branch::factory()->create()->id,
            ...$overrides,
        ];
    }
}
