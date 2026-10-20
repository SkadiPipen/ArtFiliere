import { StyleSheet, Text, View } from 'react-native';

export type AdminAnalytics = {
  as_of: string; period: string;
  artworks: Record<string, number>;
  revenue: Record<string, string>;
  activity: Record<string, number>;
};
const money = (value?: string) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminOverview({ data }: { data?: AdminAnalytics }) {
  if (!data) return null;
  const { artworks, revenue, activity } = data;
  const artworkCards: [string, number][] = [
    ['Total artwork listings', artworks.total], ['Digital artworks', artworks.digital],
    ['Physical artworks', artworks.physical], ['Awaiting artwork review', artworks.pending],
  ];
  const priorities: [string, number][] = [
    ['Open reports', activity.open_reports], ['Disputed commissions', activity.disputed_commissions],
    ['Account approvals', activity.account_approvals], ['Awaiting artwork review', artworks.pending],
    ['Artist applications', activity.artist_applications], ['Open support tickets', activity.open_support_tickets],
    ['Awaiting driver', activity.pending_deliveries], ['Pending payments', activity.pending_payments],
  ];
  const operations: [string, number][] = [
    ['Paid purchases', activity.paid_purchases], ['Active commissions', activity.active_commissions],
    ['Completed commissions', activity.completed_commissions], ['Active deliveries', activity.active_deliveries],
    ['Active auctions', activity.active_auctions], ['Registered users', activity.users], ['Artists', activity.artists],
  ];
  return <View style={s.section}>
    <Text style={s.note}>All time · Updated {new Date(data.as_of).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Manila)</Text>
    <Text style={s.heading}>Needs attention</Text>
    <View style={s.grid}>{priorities.map(([label, value]) => <View key={label} style={s.card}><Text style={s.label}>{label}</Text><Text style={s.number}>{value.toLocaleString()}</Text></View>)}</View>
    <Text style={s.heading}>Sales & royalty totals</Text>
    <View style={s.grid}>{[
      ['Buy n Sell', revenue.shop_collected, revenue.shop_platform_fees],
      ['Commission', revenue.commission_collected, revenue.commission_platform_fees],
      ['Artist royalties', revenue.artist_royalties, revenue.royalty_platform_fees],
    ].map(([label, value, fee]) => <View style={s.card} key={label}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.revenueAmount}>{money(value)}</Text>
      <Text style={s.fee}>Platform fees: {money(fee)}</Text>
    </View>)}</View>
    <View style={s.grid}>{[
      ['Shop refunds', revenue.shop_refunded], ['Commission refunds / wallet credits', revenue.commission_refunded],
    ].map(([label, value]) => <View style={s.card} key={label}><Text style={s.label}>{label}</Text><Text style={s.amount}>{money(value)}</Text></View>)}</View>
    <Text style={s.heading}>Artwork overview</Text>
    <View style={s.grid}>{artworkCards.map(([label, value]) => <View key={label} style={s.card}>
      <Text style={s.label}>{label}</Text><Text style={s.number}>{value.toLocaleString()}</Text>
    </View>)}</View>
    <Text style={s.note}>{artworks.approved} approved · {artworks.pending} pending · {artworks.declined} declined. Completed commission works are counted in Platform activity.</Text>
    <Text style={s.heading}>Platform activity</Text>
    <View style={s.grid}>{operations.map(([label, value]) => <View key={label} style={s.card}><Text style={s.label}>{label}</Text><Text style={s.number}>{value.toLocaleString()}</Text></View>)}</View>
  </View>;
}
const s = StyleSheet.create({
  section: { gap: 12, marginVertical: 20 }, heading: { fontSize: 21, fontWeight: '800', color: '#322B29', marginTop: 10 },
  note: { fontSize: 12, lineHeight: 19, color: '#746865' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 210, padding: 17, borderWidth: 1, borderColor: '#E3D8CC', backgroundColor: '#FFF', borderRadius: 12 },
  label: { fontSize: 12, color: '#746865', fontWeight: '600' }, number: { fontSize: 28, color: '#C15656', fontWeight: '800', marginTop: 8 },
  amount: { fontSize: 21, color: '#342B28', fontWeight: '800', marginTop: 8 }, revenueAmount: { fontSize: 28, color: '#342B28', fontWeight: '800', marginTop: 10 },
  fee: { fontSize: 12, color: '#746865', marginTop: 8 },
});
