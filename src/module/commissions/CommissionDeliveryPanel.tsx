import { Text, TextInput } from '@/components/Typography';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

const steps = [ ['pending', 'Waiting for driver'], ['accepted', 'Driver assigned'], ['arrived_at_artist', 'Driver arrived at artist'], ['picked_up', 'Picked up'], ['in_transit', 'In transit'], ['arrived_at_buyer', 'Driver arrived at buyer'], ['delivered', 'Delivered'] ];

export default function CommissionDeliveryPanel({ data, milestone, busy, onAction }: {
  data: any; milestone: any; busy: boolean; onAction: (action: string, extra?: any) => void;
}) {
  const [external, setExternal] = useState(false);
  const [tracking, setTracking] = useState('');
  if (data.art_type?.toLowerCase() !== 'physical' || milestone?.number !== 3) return null;
  const delivery = data.delivery;
  const ready = !!milestone.delivery_ready_at;
  const submitted = milestone.status === 'SUBMITTED';
  const enabled = submitted && !data.disputed;
  const reference = delivery?.tracking_reference || data.courier_tracking;
  const hasReference = Boolean(reference);
  const received = Boolean(data.delivered_at);
  const approved = Boolean(milestone.approved_at);
  const isArtist = Boolean(data.is_artist);
  const canReceive = delivery ? delivery.status === 'delivered' && Boolean(delivery.has_delivery_proof) : hasReference;
  const button = (label: string, action: string, extra?: any, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} onPress={() => onAction(action, extra)} style={{ backgroundColor: '#C15656', borderRadius: 10, padding: 12, opacity: busy || disabled ? 0.5 : 1 }}><Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  return <View style={{ gap: 12, borderTopWidth: 1, borderColor: '#E2D5CE', paddingTop: 16 }}>
    <Text style={{ fontWeight: '800', fontSize: 18, color: '#B84A4A' }}>Physical delivery</Text>
    <Text>Final payment stays locked until the buyer confirms receipt, inspects the artwork and approves the final milestone.</Text>
    {!submitted && !approved && <Text>Submit the final artwork preview before arranging delivery.</Text>}
    {enabled && !ready && !hasReference && (isArtist ? <Text>Waiting for the buyer to approve the final preview as ready for delivery.</Text> : button('Approve artwork as ready for delivery', 'ready_delivery'))}
    {ready && <Text>Ready for delivery approved: {new Date(milestone.delivery_ready_at).toLocaleString()}</Text>}
    {!!hasReference && <Text selectable style={{ fontWeight: '700' }}>Tracking: {reference}</Text>}
    {Boolean(delivery) && <>
      <Text>Status: {delivery.status === 'pending' ? 'Waiting for driver' : delivery.status_label}</Text>
      <Text>Driver: {delivery.driver ? `${delivery.driver.name} · ${delivery.driver.phone || 'No contact number'}` : 'Not assigned yet'}</Text>
      <Text>Pickup: {delivery.pickup_address}</Text><Text>Destination: {delivery.delivery_address}</Text>
      {!!data.terms.delivery_floor_unit && <Text>Floor / Unit / Room: {data.terms.delivery_floor_unit}</Text>}
      {!!data.terms.delivery_instruction && <Text>Instructions: {data.terms.delivery_instruction}</Text>}
      <Text>Agreed delivery fee: PHP {delivery.fee}</Text>
      {steps.filter(([key]) => delivery.timeline[key]).map(([key, label]) => <Text key={key}>{label} · {new Date(delivery.timeline[key]).toLocaleString()}</Text>)}
    </>}
    {!delivery && hasReference && <Text>External courier shipment. Use the courier reference above to track delivery.</Text>}
    {enabled && ready && isArtist && !hasReference && <>
      {button('Request platform driver pickup', 'request_pickup')}
      <TouchableOpacity accessibilityRole="button" onPress={() => setExternal(value => !value)}><Text style={{ color: '#B84A4A' }}>{external ? 'Hide external courier option' : 'Use an external courier instead'}</Text></TouchableOpacity>
      {external && <><TextInput accessibilityLabel="External courier and tracking reference" value={tracking} onChangeText={setTracking} placeholder="Courier name and tracking reference" maxLength={500} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8C9C3', borderRadius: 8, padding: 12 }} />{button('Record external courier shipment', 'ship', { tracking }, tracking.trim().length < 3)}</>}
    </>}
    {enabled && !isArtist && !received && canReceive && button('Confirm receipt — I received the artwork', 'receive')}
    {received && <Text>Buyer confirmed receipt: {new Date(data.delivered_at).toLocaleString()}</Text>}
    {enabled && !isArtist && received && button('Approve inspected artwork and release final payment', 'approve')}
    {approved && <Text>Final artwork approved. Delivery and commission complete.</Text>}
    {Boolean(data.disputed) && <Text>Delivery actions are on hold while Customer Service reviews the dispute.</Text>}
  </View>;
}
