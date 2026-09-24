<?php

namespace App\Enums;

enum PermissionKey: string
{
    case ViewBranches = 'branches.view';
    case CreateBranches = 'branches.create';
    case UpdateBranches = 'branches.update';

    case ViewUsers = 'users.view';
    case CreateUsers = 'users.create';
    case UpdateUsers = 'users.update';

    case ViewSubscribers = 'subscribers.view';
    case CreateSubscribers = 'subscribers.create';
    case UpdateSubscribers = 'subscribers.update';
    case UpdateSubscriberMinimumCharge = 'subscribers.update_minimum_charge';

    case ViewTariffs = 'tariffs.view';
    case CreateTariffs = 'tariffs.create';
    case UpdateTariffs = 'tariffs.update';

    case ViewCircuitBreakers = 'circuit_breakers.view';
    case CreateCircuitBreakers = 'circuit_breakers.create';
    case UpdateCircuitBreakers = 'circuit_breakers.update';

    case ViewMeterBoxes = 'meter_boxes.view';
    case CreateMeterBoxes = 'meter_boxes.create';
    case UpdateMeterBoxes = 'meter_boxes.update';

    case ViewAreas = 'areas.view';
    case CreateAreas = 'areas.create';
    case UpdateAreas = 'areas.update';

    case ViewSubAreas = 'sub_areas.view';
    case CreateSubAreas = 'sub_areas.create';
    case UpdateSubAreas = 'sub_areas.update';

    case ViewGovernorates = 'governorates.view';
    case CreateGovernorates = 'governorates.create';
    case UpdateGovernorates = 'governorates.update';

    case ViewMeterReadings = 'meter_readings.view';
    case RecordMeterReadings = 'meter_readings.record';
    case RecordCollections = 'collections.record';
    case ConfirmCollections = 'collections.confirm';
    case ViewCollections = 'collections.view';

    public function label(): string
    {
        return match ($this) {
            self::ViewBranches => 'View Branches',
            self::CreateBranches => 'Add Branches',
            self::UpdateBranches => 'Edit Branches',
            self::ViewUsers => 'View Users',
            self::CreateUsers => 'Add Users',
            self::UpdateUsers => 'Edit Users',
            self::ViewSubscribers => 'View Subscribers',
            self::CreateSubscribers => 'Add Subscribers',
            self::UpdateSubscribers => 'Edit Subscribers',
            self::UpdateSubscriberMinimumCharge => 'Edit Subscriber Minimum Charge',
            self::ViewTariffs => 'View Tariffs',
            self::CreateTariffs => 'Add Tariffs',
            self::UpdateTariffs => 'Edit Tariffs',
            self::ViewCircuitBreakers => 'View Circuit Breakers',
            self::CreateCircuitBreakers => 'Add Circuit Breakers',
            self::UpdateCircuitBreakers => 'Edit Circuit Breakers',
            self::ViewMeterBoxes => 'View Meter Boxes',
            self::CreateMeterBoxes => 'Add Meter Boxes',
            self::UpdateMeterBoxes => 'Edit Meter Boxes',
            self::ViewAreas => 'View Areas',
            self::CreateAreas => 'Add Areas',
            self::UpdateAreas => 'Edit Areas',
            self::ViewSubAreas => 'View Sub Areas',
            self::CreateSubAreas => 'Add Sub Areas',
            self::UpdateSubAreas => 'Edit Sub Areas',
            self::ViewGovernorates => 'View Governorates',
            self::CreateGovernorates => 'Add Governorates',
            self::UpdateGovernorates => 'Edit Governorates',
            self::ViewMeterReadings => 'View Meter Readings',
            self::RecordMeterReadings => 'Record Meter Readings',
            self::RecordCollections => 'Record Collections',
            self::ConfirmCollections => 'Confirm Collections',
            self::ViewCollections => 'View Collections',
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
                'actions' => ['view' => self::ViewBranches, 'create' => self::CreateBranches, 'update' => self::UpdateBranches],
            ],
            'users' => [
                'label' => 'Users',
                'actions' => ['view' => self::ViewUsers, 'create' => self::CreateUsers, 'update' => self::UpdateUsers],
            ],
            'subscribers' => [
                'label' => 'Subscribers',
                'actions' => [
                    'view' => self::ViewSubscribers,
                    'create' => self::CreateSubscribers,
                    'update' => self::UpdateSubscribers,
                    'minimum_charge' => self::UpdateSubscriberMinimumCharge,
                ],
            ],
            'tariffs' => [
                'label' => 'Tariffs',
                'actions' => ['view' => self::ViewTariffs, 'create' => self::CreateTariffs, 'update' => self::UpdateTariffs],
            ],
            'meter_boxes' => [
                'label' => 'Meter Boxes',
                'actions' => ['view' => self::ViewMeterBoxes, 'create' => self::CreateMeterBoxes, 'update' => self::UpdateMeterBoxes],
            ],
            'circuit_breakers' => [
                'label' => 'Circuit Breakers',
                'actions' => ['view' => self::ViewCircuitBreakers, 'create' => self::CreateCircuitBreakers, 'update' => self::UpdateCircuitBreakers],
            ],
            'areas' => [
                'label' => 'Areas',
                'actions' => ['view' => self::ViewAreas, 'create' => self::CreateAreas, 'update' => self::UpdateAreas],
            ],
            'sub_areas' => [
                'label' => 'Sub Areas',
                'actions' => ['view' => self::ViewSubAreas, 'create' => self::CreateSubAreas, 'update' => self::UpdateSubAreas],
            ],
            'governorates' => [
                'label' => 'Governorates',
                'actions' => ['view' => self::ViewGovernorates, 'create' => self::CreateGovernorates, 'update' => self::UpdateGovernorates],
            ],
            'meter_readings' => [
                'label' => 'Meter Readings',
                'actions' => ['view' => self::ViewMeterReadings, 'record' => self::RecordMeterReadings],
            ],
            'collections' => [
                'label' => 'Collections',
                'actions' => ['view' => self::ViewCollections, 'record' => self::RecordCollections, 'confirm' => self::ConfirmCollections],
            ],
        ];
    }
}
