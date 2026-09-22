<?php

namespace App\Http\Requests;

use App\Models\Branch;
use App\Models\SubArea;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMeterBoxRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('meter_box'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'box_number' => ['required', 'string', 'max:255', Rule::unique('meter_boxes', 'box_number')->ignore($this->route('meter_box'))],
            'sub_area_id' => ['nullable', Rule::exists('sub_areas', 'id'), $this->subAreaBelongsToBranchArea()],
            'location' => ['nullable', 'string', 'max:255'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }

    /**
     * A chosen sub-area must belong to the meter box's branch's own area —
     * the branch itself is either the request's own `branch_id` (Super
     * Admin) or the meter box's current branch (everyone else, since they
     * can't change it).
     */
    private function subAreaBelongsToBranchArea(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            if (! $value) {
                return;
            }

            $branchId = $this->user()->isSuperAdmin() ? $this->input('branch_id') : $this->route('meter_box')->branch_id;
            $branch = Branch::find($branchId);
            $subArea = SubArea::find($value);

            if ($branch?->area_id && $subArea && $subArea->area_id !== $branch->area_id) {
                $fail('منطقة 2 المختارة لا تتبع منطقة الفرع.');
            }
        };
    }
}
