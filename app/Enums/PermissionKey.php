<?php

namespace App\Enums;

enum PermissionKey: string
{
    case ViewBranches = 'branches.view';
    case CreateBranches = 'branches.create';
    case UpdateBranches = 'branches.update';
    case DeleteBranches = 'branches.delete';

    case ViewUsers = 'users.view';
    case CreateUsers = 'users.create';
    case UpdateUsers = 'users.update';
    case DeleteUsers = 'users.delete';

    case ViewUserTypes = 'user_types.view';
    case CreateUserTypes = 'user_types.create';
    case UpdateUserTypes = 'user_types.update';
    case DeleteUserTypes = 'user_types.delete';

    case ViewSubscribers = 'subscribers.view';
    case CreateSubscribers = 'subscribers.create';
    case UpdateSubscribers = 'subscribers.update';
    case DeleteSubscribers = 'subscribers.delete';
    case UpdateSubscriberMinimumCharge = 'subscribers.update_minimum_charge';

    case ViewTariffs = 'tariffs.view';
    case CreateTariffs = 'tariffs.create';
    case UpdateTariffs = 'tariffs.update';
    case DeleteTariffs = 'tariffs.delete';

    case ViewCircuitBreakers = 'circuit_breakers.view';
    case CreateCircuitBreakers = 'circuit_breakers.create';
    case UpdateCircuitBreakers = 'circuit_breakers.update';
    case DeleteCircuitBreakers = 'circuit_breakers.delete';

    case ViewMeterBoxes = 'meter_boxes.view';
    case CreateMeterBoxes = 'meter_boxes.create';
    case UpdateMeterBoxes = 'meter_boxes.update';
    case DeleteMeterBoxes = 'meter_boxes.delete';

    case ViewAreas = 'areas.view';
    case CreateAreas = 'areas.create';
    case UpdateAreas = 'areas.update';
    case DeleteAreas = 'areas.delete';

    case ViewSubAreas = 'sub_areas.view';
    case CreateSubAreas = 'sub_areas.create';
    case UpdateSubAreas = 'sub_areas.update';
    case DeleteSubAreas = 'sub_areas.delete';

    case ViewGovernorates = 'governorates.view';
    case CreateGovernorates = 'governorates.create';
    case UpdateGovernorates = 'governorates.update';
    case DeleteGovernorates = 'governorates.delete';

    case ViewMeterReadings = 'meter_readings.view';
    case RecordMeterReadings = 'meter_readings.record';
    case ApproveMeterReadings = 'meter_readings.approve';
    case RecordCollections = 'collections.record';
    case ConfirmCollections = 'collections.confirm';
    case ViewCollections = 'collections.view';
    case AdjustBalances = 'collections.adjust';
    case CorrectTransactions = 'collections.correct';
    case DeleteTransactions = 'collections.delete';
    case PrepareClosings = 'closings.prepare';
    case AuditClosings = 'closings.audit';
    case ViewAllClosings = 'closings.view_all';

    public function label(): string
    {
        return match ($this) {
            self::ViewBranches => 'View Branches',
            self::CreateBranches => 'Add Branches',
            self::UpdateBranches => 'Edit Branches',
            self::DeleteBranches => 'Delete Branches',
            self::ViewUsers => 'View Users',
            self::CreateUsers => 'Add Users',
            self::UpdateUsers => 'Edit Users',
            self::DeleteUsers => 'Delete Users',
            self::ViewUserTypes => 'View User Types',
            self::CreateUserTypes => 'Add User Types',
            self::UpdateUserTypes => 'Edit User Types',
            self::DeleteUserTypes => 'Delete User Types',
            self::ViewSubscribers => 'View Subscribers',
            self::CreateSubscribers => 'Add Subscribers',
            self::UpdateSubscribers => 'Edit Subscribers',
            self::DeleteSubscribers => 'Delete Subscribers',
            self::UpdateSubscriberMinimumCharge => 'Edit Subscriber Minimum Charge',
            self::ViewTariffs => 'View Tariffs',
            self::CreateTariffs => 'Add Tariffs',
            self::UpdateTariffs => 'Edit Tariffs',
            self::DeleteTariffs => 'Delete Tariffs',
            self::ViewCircuitBreakers => 'View Circuit Breakers',
            self::CreateCircuitBreakers => 'Add Circuit Breakers',
            self::UpdateCircuitBreakers => 'Edit Circuit Breakers',
            self::DeleteCircuitBreakers => 'Delete Circuit Breakers',
            self::ViewMeterBoxes => 'View Meter Boxes',
            self::CreateMeterBoxes => 'Add Meter Boxes',
            self::UpdateMeterBoxes => 'Edit Meter Boxes',
            self::DeleteMeterBoxes => 'Delete Meter Boxes',
            self::ViewAreas => 'View Areas',
            self::CreateAreas => 'Add Areas',
            self::UpdateAreas => 'Edit Areas',
            self::DeleteAreas => 'Delete Areas',
            self::ViewSubAreas => 'View Sub Areas',
            self::CreateSubAreas => 'Add Sub Areas',
            self::UpdateSubAreas => 'Edit Sub Areas',
            self::DeleteSubAreas => 'Delete Sub Areas',
            self::ViewGovernorates => 'View Governorates',
            self::CreateGovernorates => 'Add Governorates',
            self::UpdateGovernorates => 'Edit Governorates',
            self::DeleteGovernorates => 'Delete Governorates',
            self::ViewMeterReadings => 'View Meter Readings',
            self::RecordMeterReadings => 'Record Meter Readings',
            self::ApproveMeterReadings => 'Approve Meter Readings',
            self::RecordCollections => 'Record Collections',
            self::ConfirmCollections => 'Confirm Collections',
            self::ViewCollections => 'View Collections',
            self::AdjustBalances => 'Add Charges and Discounts',
            self::CorrectTransactions => 'Edit Transactions',
            self::DeleteTransactions => 'Delete Transactions',
            self::PrepareClosings => 'Prepare Closings',
            self::AuditClosings => 'Audit Closings',
            self::ViewAllClosings => 'View All Closings and Reports',
        };
    }

    /**
     * Whether this permission shapes the company itself — its branches and
     * the governorate/area map they sit in — rather than work inside one
     * branch. That is the general manager's job, so only a Super Admin may
     * grant these. (Sub-areas stay grantable: staff add them only inside
     * their own branch's area.)
     */
    public function isCompanyWide(): bool
    {
        return match ($this) {
            self::ViewBranches, self::CreateBranches, self::UpdateBranches, self::DeleteBranches,
            self::ViewGovernorates, self::CreateGovernorates, self::UpdateGovernorates, self::DeleteGovernorates,
            self::ViewAreas, self::CreateAreas, self::UpdateAreas, self::DeleteAreas,
            self::ViewUserTypes, self::CreateUserTypes, self::UpdateUserTypes, self::DeleteUserTypes,
            // Reviewing closings, or seeing every branch's, reaches past one branch, so the company grants it.
            self::AuditClosings, self::ViewAllClosings => true,
            default => false,
        };
    }

    /**
     * Every permission key, grouped by the table/resource it governs, for
     * rendering the Settings → Permissions matrix. Each group lists its
     * columns in display order as [action => PermissionKey]; a resource
     * that has no grantable key for a given action (e.g. Collections has no
     * "create" — it's recorded/confirmed instead) simply omits that action.
     *
     * @return array<string, array{label: string, actions: array<string, self>}>
     */
    public static function resourceGroups(): array
    {
        return [
            'branches' => [
                'label' => 'Branches',
                'actions' => ['view' => self::ViewBranches, 'create' => self::CreateBranches, 'update' => self::UpdateBranches, 'delete' => self::DeleteBranches],
            ],
            'users' => [
                'label' => 'Users',
                'actions' => ['view' => self::ViewUsers, 'create' => self::CreateUsers, 'update' => self::UpdateUsers, 'delete' => self::DeleteUsers],
            ],
            'user_types' => [
                'label' => 'User Types',
                'actions' => ['view' => self::ViewUserTypes, 'create' => self::CreateUserTypes, 'update' => self::UpdateUserTypes, 'delete' => self::DeleteUserTypes],
            ],
            'subscribers' => [
                'label' => 'Subscribers',
                'actions' => [
                    'view' => self::ViewSubscribers,
                    'create' => self::CreateSubscribers,
                    'update' => self::UpdateSubscribers,
                    'delete' => self::DeleteSubscribers,
                    'minimum_charge' => self::UpdateSubscriberMinimumCharge,
                ],
            ],
            'tariffs' => [
                'label' => 'Tariffs',
                'actions' => ['view' => self::ViewTariffs, 'create' => self::CreateTariffs, 'update' => self::UpdateTariffs, 'delete' => self::DeleteTariffs],
            ],
            'meter_boxes' => [
                'label' => 'Meter Boxes',
                'actions' => ['view' => self::ViewMeterBoxes, 'create' => self::CreateMeterBoxes, 'update' => self::UpdateMeterBoxes, 'delete' => self::DeleteMeterBoxes],
            ],
            'circuit_breakers' => [
                'label' => 'Circuit Breakers',
                'actions' => ['view' => self::ViewCircuitBreakers, 'create' => self::CreateCircuitBreakers, 'update' => self::UpdateCircuitBreakers, 'delete' => self::DeleteCircuitBreakers],
            ],
            'areas' => [
                'label' => 'Areas',
                'actions' => ['view' => self::ViewAreas, 'create' => self::CreateAreas, 'update' => self::UpdateAreas, 'delete' => self::DeleteAreas],
            ],
            'sub_areas' => [
                'label' => 'Sub Areas',
                'actions' => ['view' => self::ViewSubAreas, 'create' => self::CreateSubAreas, 'update' => self::UpdateSubAreas, 'delete' => self::DeleteSubAreas],
            ],
            'governorates' => [
                'label' => 'Governorates',
                'actions' => ['view' => self::ViewGovernorates, 'create' => self::CreateGovernorates, 'update' => self::UpdateGovernorates, 'delete' => self::DeleteGovernorates],
            ],
            'meter_readings' => [
                'label' => 'Meter Readings',
                'actions' => ['view' => self::ViewMeterReadings, 'record' => self::RecordMeterReadings, 'approve' => self::ApproveMeterReadings],
            ],
            'collections' => [
                'label' => 'Collections',
                'actions' => [
                    'view' => self::ViewCollections,
                    'record' => self::RecordCollections,
                    'confirm' => self::ConfirmCollections,
                    'adjust' => self::AdjustBalances,
                    'correct' => self::CorrectTransactions,
                    'delete' => self::DeleteTransactions,
                ],
            ],
            'closings' => [
                'label' => 'Closings',
                'actions' => ['prepare' => self::PrepareClosings, 'view_all' => self::ViewAllClosings, 'audit' => self::AuditClosings],
            ],
        ];
    }
}
