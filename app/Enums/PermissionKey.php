<?php

namespace App\Enums;

enum PermissionKey: string
{
    case ManageBranches = 'branches.manage';
    case ManageUsers = 'users.manage';
    case ManageSubscribers = 'subscribers.manage';
    case ManageTariffs = 'tariffs.manage';
    case ManageMeterBoxes = 'meter_boxes.manage';
    case RecordCollections = 'collections.record';
    case ConfirmCollections = 'collections.confirm';
    case ViewCollections = 'collections.view';

    public function label(): string
    {
        return match ($this) {
            self::ManageBranches => 'Manage Branches',
            self::ManageUsers => 'Manage Users',
            self::ManageSubscribers => 'Manage Subscribers',
            self::ManageTariffs => 'Manage Tariffs',
            self::ManageMeterBoxes => 'Manage Meter Boxes',
            self::RecordCollections => 'Record Collections',
            self::ConfirmCollections => 'Confirm Collections',
            self::ViewCollections => 'View Collections',
        };
    }
}
