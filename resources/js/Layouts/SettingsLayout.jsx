import AuthenticatedLayout from './AuthenticatedLayout';

/**
 * Layout for the settings pages (Branches, Tariffs, Circuit Breakers, Meter
 * Boxes, Governorates, Permissions, Reading Schedule, Print Templates).
 * The sidebar places these pages in their relevant task groups.
 */
export default function SettingsLayout({ header, children }) {
    return <AuthenticatedLayout header={header}>{children}</AuthenticatedLayout>;
}
