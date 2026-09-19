<?php

namespace App\Enums;

enum PermissionKey: string
{
    case ManageBranches = 'branches.manage';
    case ManageUsers = 'users.manage';
    case ManageSubscribers = 'subscribers.manage';
    case RecordCollections = 'collections.record';
    case ConfirmCollections = 'collections.confirm';
    case ViewCollections = 'collections.view';

    public function label(): string
    {
        return match ($this) {
            self::ManageBranches => 'Manage Branches',
            self::ManageUsers => 'Manage Users',
            self::ManageSubscribers => 'Manage Subscribers',
            self::RecordCollections => 'Record Collections',
            self::ConfirmCollections => 'Confirm Collections',
            self::ViewCollections => 'View Collections',
        };
    }
}
