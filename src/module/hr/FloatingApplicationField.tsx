import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Text, TextInput } from '@/components/Typography';
import { dateValue, parseDateValue } from '@/components/calendarDateValue';

type Props = { label: string; value: string; onChange: (value: string) => void; maxLength?: number; multiline?: boolean; date?: boolean; maximumDate?: Date; keyboardType?: 'default' | 'email-address' | 'phone-pad'; disabled?: boolean };
export default function FloatingApplicationField({ label, value, onChange, maxLength, multiline, date, maximumDate, keyboardType, disabled }: Props) {
  const [focused, setFocused] = useState(false), [open, setOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const webDate = useRef<HTMLInputElement | null>(null);
  useEffect(() => { let active = true; void AccessibilityInfo.isReduceMotionEnabled().then(enabled => { if (active) setReduceMotion(enabled); }); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => { active = false; subscription.remove(); }; }, []);
  useEffect(() => { const animation = Animated.timing(progress, { toValue: focused || value || open ? 1 : 0, duration: reduceMotion ? 0 : 180, useNativeDriver: false }); animation.start(); return () => animation.stop(); }, [focused, value, open, reduceMotion, progress]);
  const selected = parseDateValue(value) || maximumDate || new Date();
  return <View style={{ gap: 8 }}>
    <View style={{ minHeight: multiline ? 118 : 62, borderRadius: 11, borderWidth: focused || open ? 1.5 : 1, borderColor: '#BE5552', backgroundColor: '#FFF', overflow: 'hidden', opacity: disabled ? 0.6 : 1 }}>
      {date && Platform.OS === 'web' && createElement('style', null, '.hr-floating-date::-webkit-calendar-picker-indicator { opacity: 0; }')}
      <Animated.Text numberOfLines={1} pointerEvents="none" style={{ position: 'absolute', zIndex: 1, left: 14, right: date ? 43 : 12, top: progress.interpolate({ inputRange: [0, 1], outputRange: [20, 7] }), fontSize: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 11] }), color: focused || value || open ? '#A74646' : '#8A7770' }}>{label}</Animated.Text>
      {date ? Platform.OS === 'web' ? createElement('input', {
        ref: (element: HTMLInputElement | null) => { webDate.current = element; }, className: 'hr-floating-date', type: 'date', value, disabled, 'aria-label': label,
        max: maximumDate ? dateValue(maximumDate) : undefined,
        onFocus: () => setFocused(true), onBlur: () => setFocused(false), onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
        style: { width: '100%', height: 60, boxSizing: 'border-box', border: 0, outline: 'none', background: 'transparent', padding: '23px 44px 7px 14px', fontFamily: 'inherit', fontSize: 14, color: value || focused ? '#4D3D36' : 'transparent', colorScheme: 'light' },
      }) : <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={{ minHeight: 60, paddingTop: 25, paddingBottom: 9, paddingLeft: 14, paddingRight: 45 }}><Text style={{ fontSize: 14, color: '#4D3D36' }}>{value ? selected.toLocaleDateString() : ' '}</Text></Pressable> : <TextInput underlineColorAndroid="transparent" accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} maxLength={maxLength} multiline={multiline} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ borderWidth: 0, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineWidth: 0, outlineColor: '#BE5552' } : {}), minHeight: multiline ? 116 : 60, paddingTop: 24, paddingBottom: 9, paddingHorizontal: 14, fontSize: 14, color: '#4D3D36', textAlignVertical: multiline ? 'top' : 'center' }} />}
      {date && <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Choose ${label}`} onPress={() => { if (Platform.OS === 'web') { webDate.current?.focus(); try { webDate.current?.showPicker?.(); } catch { /* Native date control remains keyboard accessible. */ } } else setOpen(true); }} style={{ position: 'absolute', right: 10, top: 17, padding: 3, backgroundColor: '#FFF' }}><CalendarDays size={21} color="#B95552" /></Pressable>}
    </View>
    {date && open && Platform.OS !== 'web' && <><DateTimePicker value={selected} mode="date" maximumDate={maximumDate} display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={(event, picked) => { if (Platform.OS !== 'ios') setOpen(false); if (event.type === 'set' && picked) onChange(dateValue(picked)); }} />{Platform.OS === 'ios' && <Pressable onPress={() => setOpen(false)}><Text style={{ color: '#A74646', textAlign: 'right', padding: 8 }}>Done</Text></Pressable>}</>}
  </View>;
}
