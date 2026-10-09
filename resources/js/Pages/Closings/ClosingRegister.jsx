import DatePicker from '@/Components/DatePicker';
import SelectInput from '@/Components/SelectInput';
import { usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { weekDayName } from '@/lib/weekDays';
import { closingMoney, shortDate, statusClass } from '@/lib/closing';

const STATUS_COLORS = { approved: 'var(--cl-success)', submitted: 'var(--cl-info)', returned: 'var(--cl-danger)', draft: 'var(--cl-muted)' };

/**
 * The closings register: every daily closing of the chosen branches and
 * days, with its figures and who prepared and approved it, the totals, and
 * the branch-days that had payments but no closing. Downloads as a CSV for
 * a spreadsheet, or prints.
 */
export default function ClosingRegister({ register, branches, onChange, onOpenDay, canExport }) {
    const { errors } = usePage().props;
    const query = new URLSearchParams(
        Object.entries({ from: register.from, to: register.to, status: register.status ?? '', filter_branch: register.branchId ?? '' }).filter(
            ([, value]) => value !== '',
        ),
    ).toString();

    function filter(changes) {
        onChange({
            from: register.from,
            to: register.to,
            status: register.status ?? undefined,
            filter_branch: register.branchId ?? undefined,
            ...changes,
        });
    }

    return (
        <>
            <div className="ctl">
                <label className="cb">
                    <Icon name="calendar" />
                    <small>من</small>
                    <DatePicker
                        type="date"
                        value={register.from}
                        max={register.to}
                        onChange={(event) => event.target.value && filter({ from: event.target.value })}
                        style={{ border: 0, fontWeight: 600 }}
                    />
                </label>
                <label className="cb">
                    <small>إلى</small>
                    <DatePicker
                        type="date"
                        value={register.to}
                        min={register.from}
                        onChange={(event) => event.target.value && filter({ to: event.target.value })}
                        style={{ border: 0, fontWeight: 600 }}
                    />
                </label>
                <label className="cb">
                    <Icon name="pin" />
                    <small>الفرع</small>
                    <SelectInput
                        aria-label="الفرع"
                        value={register.branchId ?? ''}
                        onChange={(event) => filter({ filter_branch: event.target.value || undefined })}
                        style={{ border: 0, fontWeight: 700 }}
                    >
                        {branches.length > 1 && <option value="">كل الفروع</option>}
                        {branches.map((branch) => (
                            <option key={branch.value} value={branch.value}>
                                {branch.label}
                            </option>
                        ))}
                    </SelectInput>
                </label>
                <label className="cb">
                    <small>الحالة</small>
                    <SelectInput
                        aria-label="الحالة"
                        value={register.status ?? ''}
                        onChange={(event) => filter({ status: event.target.value || undefined })}
                        style={{ border: 0, fontWeight: 700 }}
                    >
                        <option value="">كل الحالات</option>
                        {register.statuses.map((status) => (
                            <option key={status.value} value={status.value}>
                                {status.label}
                            </option>
                        ))}
                    </SelectInput>
                </label>
                <span className="sp" />
                {canExport && <a className="btn" href={`/closings/register.csv?${query}`}>
                    <Icon name="arrow-down-tray" />
                    تنزيل Excel (CSV)
                </a>}
                <button type="button" className="btn" onClick={() => window.print()}>
                    <Icon name="printer" />
                    طباعة
                </button>
            </div>
            {errors.from && (
                <div className="ban bad" role="alert">
                    <Icon name="alert" />
                    <div>{errors.from}</div>
                </div>
            )}

            <div className="kp">
                <div>
                    <small>الكشوف</small>
                    <b>{register.totals.closings}</b>
                    <span>{register.totals.approved} معتمد</span>
                </div>
                <div>
                    <small>التحصيل المؤكد</small>
                    <b>{closingMoney(register.totals.total)} ₪</b>
                    <span>
                        {shortDate(register.from)} – {shortDate(register.to)}
                    </span>
                </div>
                <div className={Number(register.totals.difference) !== 0 ? 'r' : ''}>
                    <small>فروق النقد</small>
                    <b>{closingMoney(register.totals.difference)} ₪</b>
                    <span>المعدود − المتوقع</span>
                </div>
                <div className={Number(register.totals.pending) > 0 ? 'w' : ''}>
                    <small>إيصالات معلّقة</small>
                    <b>{closingMoney(register.totals.pending)} ₪</b>
                    <span>خارج التحصيل المؤكد</span>
                </div>
                <div>
                    <small>المسلَّم للشركة</small>
                    <b>{closingMoney(register.totals.handedOver)} ₪</b>
                    <span>استُلم {closingMoney(register.totals.received)} ₪</span>
                </div>
            </div>

            {register.missing.length > 0 && (
                <div className="ban warn">
                    <Icon name="alert" />
                    <div>
                        <b>{register.missing.length} أيام فيها دفعات ولم يُفتح كشفها</b>
                        {register.missing
                            .slice(0, 8)
                            .map((day) => `${day.branchName} ${shortDate(day.day)} (${closingMoney(day.total)} ₪)`)
                            .join('، ')}
                        {register.missing.length > 8 && '…'}
                    </div>
                </div>
            )}

            <section className="pn" style={{ marginTop: 16 }}>
                <h3>
                    <span className="ix">
                        <Icon name="table" />
                    </span>
                    سجل الكشوف
                    <span className="r">اضغط كشفًا لفتحه</span>
                </h3>
                <div className="mxw" style={{ overflowX: 'auto' }}>
                    <table className="mx">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>الفرع</th>
                                <th>الكشف</th>
                                <th>الحالة</th>
                                <th>الدفعات</th>
                                <th>التحصيل ₪</th>
                                <th>المتوقع</th>
                                <th>المعدود</th>
                                <th>الفرق</th>
                                <th>معلّق</th>
                                <th>المسلَّم</th>
                                <th>أعدّه</th>
                                <th>اعتمده</th>
                            </tr>
                        </thead>
                        <tbody>
                            {register.rows.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                                        لا كشوف في هذه الفترة.
                                    </td>
                                </tr>
                            )}
                            {register.rows.map((row) => (
                                <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => onOpenDay(row.branchId, row.day)}>
                                    <td>
                                        {weekDayName(row.day)} <span className="num">{shortDate(row.day)}</span>
                                    </td>
                                    <td>{row.branchName}</td>
                                    <td>
                                        <span className="tv">{row.number}</span>
                                    </td>
                                    <td>
                                        <span className={`st ${statusClass(row.status)}`} style={{ color: STATUS_COLORS[row.status] }}>
                                            <i />
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="tv">{row.payments}</span>
                                    </td>
                                    <td>
                                        <span className="tv">{closingMoney(row.total)}</span>
                                    </td>
                                    <td>
                                        <span className="tv">{closingMoney(row.expected)}</span>
                                    </td>
                                    <td>
                                        <span className="tv">{row.counted === null ? '—' : closingMoney(row.counted)}</span>
                                    </td>
                                    <td>
                                        <span className={`tv ${row.difference && Number(row.difference) !== 0 ? 'w' : ''}`}>
                                            {row.difference === null ? '—' : closingMoney(row.difference)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`tv ${Number(row.pending) > 0 ? 'w' : ''}`}>{closingMoney(row.pending)}</span>
                                    </td>
                                    <td>
                                        <span className="tv">{closingMoney(row.handedOver)}</span>
                                    </td>
                                    <td>{row.preparedBy ?? '—'}</td>
                                    <td>
                                        {row.reviewedBy ?? '—'}
                                        {row.reviewedAt && (
                                            <small className="muted num" style={{ display: 'block' }}>
                                                {row.reviewedAt}
                                            </small>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>المجموع</td>
                                <td />
                                <td>{register.totals.closings}</td>
                                <td />
                                <td />
                                <td>{closingMoney(register.totals.total)}</td>
                                <td />
                                <td>{closingMoney(register.totals.counted)}</td>
                                <td>{closingMoney(register.totals.difference)}</td>
                                <td>{closingMoney(register.totals.pending)}</td>
                                <td>{closingMoney(register.totals.handedOver)}</td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>
        </>
    );
}
