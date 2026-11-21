import { COLORS } from '@/constants/colors';
import type { AuctionScheduleProps } from './AuctionScheduleField';

export default function AuctionScheduleField({ label, value, minimum, onChange }: AuctionScheduleProps) {
  return <input type="datetime-local" aria-label={label} value={value} min={minimum}
    onChange={event => onChange(event.currentTarget.value)}
    onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* Native browser interaction remains available. */ } }}
    style={{ minHeight: 48, boxSizing: 'border-box', width: '100%', borderRadius: 8, border: `1px solid ${COLORS.border}`, padding: '0 12px', fontFamily: 'inherit', fontSize: 14, color: COLORS.textDark, background: COLORS.white }} />;
}
