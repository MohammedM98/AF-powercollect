import AuthenticatedLayout from './AuthenticatedLayout';

/**
 * Layout for the settings pages (Branches, Tariffs, Circuit Breakers, Meter
 * Boxes, Governorates, Permissions, Reading Schedule). They are listed under
 * "الإعدادات" in the sidebar, so this is the regular layout.
 */
export default function SettingsLayout({ header, children }) {
    return <AuthenticatedLayout header={header}>{children}</AuthenticatedLayout>;
}
