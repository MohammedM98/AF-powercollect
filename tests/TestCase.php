<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Pages render without the compiled frontend (`npm run build`), so the
     * tests pass on a fresh checkout and in CI, which only installs the
     * PHP dependencies.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }
}
