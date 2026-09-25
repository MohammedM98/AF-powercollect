# Employee permissions screen — design description

This is a proposed Arabic, right-to-left interface for managing employee permissions. It describes the refined concept image shown in this conversation. The image is a design proposal, not a screenshot of the running application.

## Page layout

- A dark graphite navigation sidebar sits on the right, with **Permissions** highlighted in burgundy.
- The page title is **إدارة صلاحيات الموظفين** (Manage employee permissions).
- A narrow panel on the right lists employees. It includes search, role and branch filters, and each employee's name, role, and branch.
- A wider panel on the left shows the selected employee and their editable permissions. Keeping the list visible makes it easy to switch employees without reopening a modal.
- The example employee is **أحمد خالد**, a collector in the Hebron branch. These names are illustrative.

## Permission editor

Each resource has its own clearly labeled row. The available actions follow the application's permission model:

| Resource | Available actions |
| --- | --- |
| Subscribers (المشتركون) | View, add, edit; separate sensitive permission to edit the minimum charge |
| Meter readings (قراءات العدادات) | View, record |
| Collections (التحصيل) | View, record, confirm |
| Users (المستخدمون) | View, add, edit |

The screenshot shows these four groups to demonstrate the layout. A complete implementation would also include the other groups already defined in the application, such as branches, tariffs, meter boxes, circuit breakers, areas, sub-areas, and governorates.

Controls appear only for actions that exist for a resource. **Confirm collections** is visually separated and marked as sensitive so an administrator notices it before granting access. The selected employee's name, role, and branch remain visible above the controls.

## Saving and access rules

- An unsaved-changes message makes edits visible before they are submitted.
- **حفظ الصلاحيات** (Save permissions) and **إلغاء** (Cancel) are clear actions at the bottom of the editor.
- Saving applies to the selected employee only.
- Super Admins automatically have every permission. Branch Admins can manage eligible staff in their own branch, as enforced by the application's existing rules.

## Visual style and UX intent

The design uses the project's burgundy accent, light content surfaces, graphite navigation, Arabic RTL alignment, generous spacing, and large permission controls. It aims to make the employee selection, current grants, sensitive actions, and save state easy to understand at a glance.

The concept image is illustrative. Before implementation, all Arabic labels and the exact placement of every permission group should be checked against the application's current UI and authorization rules.

## Implementation instruction

If this concept is implemented, make the permissions screen match the website's existing design and style. Follow the project's design rules and conventions, including its colors, typography, spacing, RTL layout, responsive behavior, accessibility patterns, and reusable components. Treat the image as a layout reference rather than a new design system. Keep the application's actual permission names, available actions, authorization rules, and save behavior accurate; do not add controls for permissions that do not exist.
