import { router } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { adminType } from './adminDesign';
import { Text } from '@/components/Typography';
import { StyleSheet, Pressable, View } from 'react-native';

export type AdminAnalytics = {
  as_of: string; period: string;
  artworks: Record<string, number>;
  revenue: Record<string, string>;
  activity: Record<string, number>;
};
const money = (value?: string) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminOverview({ data, detailed = false }: { data?: AdminAnalytics; detailed?: boolean }) {
  if (!data) return null;
  const { artworks, revenue, activity } = data;
  const priorities: [string, number][] = [['Open reports', activity.open_reports], ['Disputed commissions', activity.disputed_commissions], ['Account approvals', activity.account_approvals], ['Artwork reviews', artworks.pending], ['Artist applications', activity.artist_applications], ['Support tickets', activity.open_support_tickets], ['Awaiting driver', activity.pending_deliveries], ['Pending payments', activity.pending_payments]];
  const row = (label: string, value: string | number) => <View key={label} style={s.row}><Text style={adminType.body}>{label}</Text><Text style={adminType.cardTitle}>{typeof value === 'number' ? value.toLocaleString() : value}</Text></View>;
  return <View style={{ gap: 24, marginTop: 12 }}>
    {!detailed && <View style={s.pulse}><View style={{ flex: 1, gap: 8 }}><Text style={adminType.sectionTitle}>Platform pulse</Text><Text style={adminType.muted}>{activity.paid_purchases.toLocaleString()} paid purchases | {activity.active_commissions.toLocaleString()} active commissions | {activity.users.toLocaleString()} members</Text></View><Pressable accessibilityRole="button" onPress={() => router.push('/admin-performance')} style={s.link}><Text style={[adminType.button, { color: '#A74646' }]}>View performance</Text><ArrowUpRight size={18} color="#A74646" /></Pressable></View>}
    <View style={s.columns}>
      <View style={s.section}><Text style={adminType.sectionTitle}>Needs attention</Text><Text style={adminType.muted}>Current queue counts across the platform</Text>{priorities.map(([label, value]) => <View key={label} style={s.row}><Text style={adminType.body}>{label}</Text><View style={[s.count, value > 0 && { backgroundColor: '#F5E8E3' }]}><Text style={[adminType.button, { color: value > 0 ? '#A74646' : '#81756D' }]}>{value.toLocaleString()}</Text></View></View>)}</View>
      {detailed && <View style={s.section}><Text style={adminType.sectionTitle}>Marketplace activity</Text><Text style={adminType.muted}>Current status and all-time counts</Text>{row('Paid purchases', activity.paid_purchases)}{row('Active commissions', activity.active_commissions)}{row('Completed commissions', activity.completed_commissions)}{row('Active deliveries', activity.active_deliveries)}{row('Active auctions', activity.active_auctions)}{row('Registered users', activity.users)}{row('Artists', activity.artists)}</View>}
    </View>
    {detailed && <View style={s.columns}>
      <View style={s.section}><Text style={adminType.sectionTitle}>Revenue & royalties</Text><Text style={adminType.muted}>All time | Separate from the dated collection chart</Text>{row('Shop collections, excluding refunded purchases', money(revenue.shop_collected))}{row('Commission collections, less refunds', money(revenue.commission_collected))}{row('Artist royalties', money(revenue.artist_royalties))}{row('Shop platform fees', money(revenue.shop_platform_fees))}{row('Commission platform fees', money(revenue.commission_platform_fees))}{row('Royalty platform fees', money(revenue.royalty_platform_fees))}{row('Total platform fees', money(revenue.total_platform_fees))}{row('Shop refunds', money(revenue.shop_refunded))}{row('Commission refunds / wallet credits', money(revenue.commission_refunded))}</View>
      <View style={s.section}><Text style={adminType.sectionTitle}>Artwork catalog</Text><Text style={adminType.muted}>Current listing status</Text>{row('Total listings', artworks.total)}{row('Digital', artworks.digital)}{row('Physical', artworks.physical)}{row('Approved', artworks.approved)}{row('Pending review', artworks.pending)}{row('Declined', artworks.declined)}<Text style={adminType.muted}>Commission deliverables are counted in marketplace activity.</Text></View>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  pulse: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5DAD3', paddingVertical: 24 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 28 },
  section: { flexGrow: 1, flexShrink: 1, flexBasis: 340, gap: 14, minWidth: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, padding: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F2EAE5' },
  count: { minWidth: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignItems: 'center', backgroundColor: '#FAF7F3' },
});
