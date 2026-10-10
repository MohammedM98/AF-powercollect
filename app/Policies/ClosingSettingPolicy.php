<?php

namespace App\Policies;

/**
 * The closing schedule: each branch's admin sets their own branch's cut-off
 * and automatic opening and opens its days by hand; the company's default,
 * which the other branches follow, stays with the Super Admin.
 */
class ClosingSettingPolicy extends BranchSchedulePolicy {}
