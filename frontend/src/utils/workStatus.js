/** Shared Work Status labels for maintenance, requests, and workshop jobs. */
export const WORK_STATUS_OPTIONS = [
  { value: 'WORK_IN_PROGRESS', label: 'Work in Progress' },
  { value: 'WORK_COMPLETED', label: 'Work Completed' },
  { value: 'ETC', label: 'Estimated Time of Completion (ETC)' },
  { value: 'ADDITIONAL_WORK_REQUIRED', label: 'Additional Work Required' },
];

export function workStatusLabel(value) {
  return WORK_STATUS_OPTIONS.find((o) => o.value === value)?.label || value || '—';
}
