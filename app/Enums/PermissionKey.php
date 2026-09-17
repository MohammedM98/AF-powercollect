<?php

namespace App\Enums;

enum PermissionKey: string
{
    case ManageBranches = 'branches.manage';
    case ManageUsers = 'users.manage';

    public function label(): string
    {
        return match ($this) {
            self::ManageBranches => 'Manage Branches',
            self::ManageUsers => 'Manage Users',
        };
    }
}
