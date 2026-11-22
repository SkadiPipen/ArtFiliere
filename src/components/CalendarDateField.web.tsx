import type { CalendarDateFieldProps } from './calendarDateValue';
import { dateValue } from './calendarDateValue';
import { COLORS } from '@/constants/colors';
import { useState } from 'react';

export default function CalendarDateField({ value, onChange, label, minimumDate, maximumDate, appearance, placeholder, disabled }: CalendarDateFieldProps) {
  const [focused, setFocused] = useState(false);
  const hint = placeholder ?? (appearance === 'signup' ? label : undefined);
  const showPlaceholder = !!hint && !value && !focused;
  return <div style={{ position: 'relative', width: '100%' }}><input disabled={disabled} type="date" aria-label={label} value={value} min={minimumDate ? dateValue(minimumDate) : undefined} max={maximumDate ? dateValue(maximumDate) : undefined}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onChange={event => onChange(event.currentTarget.value)}
    onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* The browser can still open its built-in date control. */ } }}
    style={{ boxSizing: 'border-box', width: '100%', minHeight: 48, border: '1px solid #DDCFC6', borderRadius: 8, padding: 12, color: '#3A2D2A', backgroundColor: '#FFF', fontSize: 14, fontFamily: 'inherit', colorScheme: 'light', cursor: 'pointer',
      ...(appearance === 'signup' ? { backgroundColor: COLORS.white, borderColor: COLORS.red, color: value ? COLORS.textDark : COLORS.textMuted, fontSize: 15, padding: '12px 14px', height: 50, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } : {}),
      ...(showPlaceholder ? { color: 'transparent' } : {}),
    }} />
    {showPlaceholder && <span aria-hidden="true" style={{ position: 'absolute', left: 14, right: 42, top: 1, bottom: 1, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: placeholder ? '#9B8E88' : COLORS.textMuted, backgroundColor: COLORS.white, fontSize: 15, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>{hint}</span>}
  </div>;
}
