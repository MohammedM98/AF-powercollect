<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class MobileAppDownloadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['powercollect.mobile_app.directory' => Storage::disk('local')->path('release')]);
    }

    private function publishFixture(string $type = 'release'): void
    {
        $apk = 'APK-download-fixture';
        Storage::disk('local')->put('release/powercollect.apk', $apk);
        Storage::disk('local')->put('release/release.json', json_encode([
            'version' => '1.0.1', 'type' => $type, 'size' => strlen($apk), 'sha256' => hash('sha256', $apk),
        ]));
    }

    public function test_guests_cannot_open_the_page_or_download_the_application(): void
    {
        $this->publishFixture();
        $this->get(route('settings.mobile-app.index'))->assertRedirect(route('login'));
        $this->get(route('settings.mobile-app.download'))->assertRedirect(route('login'));
    }

    public function test_staff_can_download_without_receiving_permission_to_manage_settings(): void
    {
        $this->publishFixture();
        $user = User::factory()->collector()->create();
        $this->actingAs($user)->get(route('settings.mobile-app.index'))->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->component('Settings/MobileApp')
                ->where('release.version', '1.0.1')->where('release.downloadUrl', route('settings.mobile-app.download')));
        $this->get(route('settings.mobile-app.download'))->assertOk()->assertDownload('PowerCollect-1.0.1.apk')
            ->assertHeader('Content-Type', 'application/vnd.android.package-archive')->assertHeader('Cache-Control', 'no-store, private');
        $this->get(route('settings.sms.edit'))->assertForbidden();
    }

    public function test_an_unpublished_or_incomplete_upload_is_not_offered_for_download(): void
    {
        $this->actingAs(User::factory()->create())->get(route('settings.mobile-app.index'))->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->where('release', null));
        $this->get(route('settings.mobile-app.download'))->assertNotFound();
        $this->publishFixture();
        Storage::disk('local')->put('release/powercollect.apk', 'APK-download-fixturE');
        $this->get(route('settings.mobile-app.index'))->assertInertia(fn (AssertableInertia $page) => $page->where('release', null));
        $this->get(route('settings.mobile-app.download'))->assertNotFound();
    }

    public function test_debug_builds_are_not_offered_as_production_downloads(): void
    {
        $this->publishFixture('debug');
        $this->actingAs(User::factory()->create())->get(route('settings.mobile-app.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('release', null));
        $this->get(route('settings.mobile-app.download'))->assertNotFound();
    }
}
