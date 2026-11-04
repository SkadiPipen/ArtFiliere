import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '@/components/Typography';
import { purchaseRequest } from './purchases';

export type PlatformDefaults = {
  revision: number;
  platform_fee_percentage: number;
  royalty_platform_fee_percentage: number;
  royalty_platform_fee_basis: 'artist_royalty' | 'gross_sales';
  default_artist_royalty_percentage: number;
  default_exclusivity: 'non-exclusive' | 'exclusive' | 'sole';
  default_license_duration_months: number;
  license_multipliers: { personal: number; commercial: number };
  exclusivity_multipliers: { 'non-exclusive': number; exclusive: number; sole: number };
};
const DefaultsContext = createContext<PlatformDefaults | null>(null);
export function normalizeDefaults(raw: any): PlatformDefaults {
  return { ...raw, platform_fee_percentage: Number(raw.platform_fee_percentage), royalty_platform_fee_percentage: Number(raw.royalty_platform_fee_percentage), default_artist_royalty_percentage: Number(raw.default_artist_royalty_percentage), license_multipliers: Object.fromEntries(Object.entries(raw.license_multipliers).map(([key, value]) => [key, Number(value)])), exclusivity_multipliers: Object.fromEntries(Object.entries(raw.exclusivity_multipliers).map(([key, value]) => [key, Number(value)])) };
}
export function PlatformDefaultsProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaults] = useState<PlatformDefaults | null>(null);
  const [error, setError] = useState('');
  const load = async () => { setError(''); try { setDefaults(normalizeDefaults(await purchaseRequest('users/platform-defaults/'))); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  if (!defaults) return <View style={{ padding: 24, gap: 16 }}>{error ? <><Text accessibilityRole="alert">{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text>Retry loading platform defaults</Text></Pressable></> : <ActivityIndicator color="#B65B50" />}</View>;
  return <DefaultsContext.Provider value={defaults}>{children}</DefaultsContext.Provider>;
}
export function usePlatformDefaults() {
  const defaults = useContext(DefaultsContext);
  if (!defaults) throw Error('Platform defaults have not loaded.');
  return defaults;
}

export const useOptionalPlatformDefaults = () => useContext(DefaultsContext);
