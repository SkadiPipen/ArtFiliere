import type { CalendarDateFieldProps } from './calendarDateValue';
import { dateValue } from './calendarDateValue';

export default function CalendarDateField({ value, onChange, label, minimumDate, maximumDate }: CalendarDateFieldProps) {
  return <input type="date" aria-label={label} value={value} min={minimumDate ? dateValue(minimumDate) : undefined} max={maximumDate ? dateValue(maximumDate) : undefined}
    onChange={event => onChange(event.currentTarget.value)}
    onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* The browser can still open its built-in date control. */ } }}
    style={{ boxSizing: 'border-box', width: '100%', minHeight: 48, border: '1px solid #DDCFC6', borderRadius: 8, padding: 12, color: '#3A2D2A', backgroundColor: '#FFF', fontSize: 14, fontFamily: 'inherit', colorScheme: 'light', cursor: 'pointer' }} />;
}
