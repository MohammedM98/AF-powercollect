import { FAR_BEHIND_WEEKS } from '@/lib/balance';

/** «متأخر» under a balance owing more than FAR_BEHIND_WEEKS weeks of the minimum, besides the row's burgundy edge. */
export default function FarBehindMark() {
    return (
        <span className="mt-1 block text-[11.5px] font-bold text-brand-600" title={`عليه أكثر من ${FAR_BEHIND_WEEKS} أسابيع من الحد الأدنى`}>
            متأخر
        </span>
    );
}
