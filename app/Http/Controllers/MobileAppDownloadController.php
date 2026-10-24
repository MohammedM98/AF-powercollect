<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MobileAppDownloadController extends Controller
{
    public function index(): Response
    {
        $release = $this->release();

        return Inertia::render('Settings/MobileApp', [
            'release' => $release === null ? null : [
                'version' => $release['version'],
                'sizeMb' => round($release['size'] / 1048576, 1),
                'sha256' => $release['sha256'],
                'downloadUrl' => route('settings.mobile-app.download'),
            ],
        ]);
    }

    public function download(): BinaryFileResponse
    {
        $release = $this->release();
        abort_if($release === null, 404);

        return response()->download($this->directory().'/powercollect.apk', 'PowerCollect-'.$release['version'].'.apk', [
            'Content-Type' => 'application/vnd.android.package-archive',
            'Cache-Control' => 'private, no-store',
        ])->setPrivate();
    }

    /** @return array{version: string, size: int, sha256: string}|null */
    private function release(): ?array
    {
        $file = $this->directory().'/powercollect.apk';
        $metadata = $this->directory().'/release.json';
        if (! is_file($file) || ! is_file($metadata)) {
            return null;
        }
        $release = json_decode(file_get_contents($metadata), true);
        if (! is_array($release) || ($release['type'] ?? null) !== 'release'
            || ! is_string($release['version'] ?? null) || ! preg_match('/^\d+\.\d+\.\d+$/', $release['version'])
            || ! is_string($release['sha256'] ?? null) || ! preg_match('/^[a-f0-9]{64}$/', $release['sha256'])
            || ($release['size'] ?? null) !== filesize($file) || ! hash_equals($release['sha256'], hash_file('sha256', $file))) {
            return null;
        }

        return ['version' => $release['version'], 'size' => $release['size'], 'sha256' => $release['sha256']];
    }

    private function directory(): string
    {
        return config('powercollect.mobile_app.directory');
    }
}
