export const CAPACITY_CHECKLIST = [
  { code: 'identity_verified', label: 'Identity documents verified' },
  { code: 'income_reviewed', label: 'Income documents reviewed' },
  { code: 'source_of_income_confirmed', label: 'Source of income confirmed' },
  { code: 'obligations_reviewed', label: 'Existing monthly obligations reviewed' },
  { code: 'installment_within_capacity', label: 'Proposed installment is within repayment capacity' },
  { code: 'no_adverse_internal_record', label: 'No adverse internal credit record' },
] as const;

export type ChecklistCode = (typeof CAPACITY_CHECKLIST)[number]['code'];

export const CHECKLIST_RESULTS = ['pass', 'fail', 'na'] as const;
export type ChecklistResult = (typeof CHECKLIST_RESULTS)[number];
