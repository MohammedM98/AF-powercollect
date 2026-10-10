<?php

namespace App\Policies;

/**
 * The reading schedule: each branch's admin sets their own branch's reading
 * day and entry window; the company's default, which the other branches
 * follow, stays with the Super Admin.
 */
class ReadingEntrySettingPolicy extends BranchSchedulePolicy {}
