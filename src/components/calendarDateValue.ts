export type CalendarDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

// Store calendar dates locally; converting to UTC can shift the selected day.
export function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDateValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return dateValue(date) === value ? date : null;
}
