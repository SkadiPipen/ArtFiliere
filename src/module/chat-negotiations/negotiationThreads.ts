import type { Contract } from './contracts';
import type { ChatMessage } from './chats';

export function legacyProposal(message: ChatMessage) {
  return message.negotiationData?.proposal || message.negotiationData || {};
}

/** Group display rows only. Never write, replace, or delete stored attempts. */
export function buildChatTimeline(messages: ChatMessage[], contracts: Contract[]): ChatMessage[] {
  const groups = new Map<string, { contracts: Contract[]; legacy: ChatMessage[] }>();
  const group = (key: string) => {
    if (!groups.has(key)) groups.set(key, { contracts: [], legacy: [] });
    return groups.get(key)!;
  };
  const normal = messages.filter(message => message.type !== 'negotiation');
  const artworkGroups = new Map<string, string>();
  for (const contract of [...contracts].sort((a, b) => a.id - b.id)) {
    const key = contract.negotiation_key ? `session-${contract.negotiation_key}` : contract.artwork_id != null ? `artwork-${contract.artwork_id}` : `contract-${contract.id}`;
    group(key).contracts.push(contract);
    if (contract.artwork_id != null && !artworkGroups.has(String(contract.artwork_id))) artworkGroups.set(String(contract.artwork_id), key);
  }
  for (const message of messages.filter(message => message.type === 'negotiation')) {
    const proposal = legacyProposal(message);
    const id = message.artworkId ?? proposal.artworkId ?? message.negotiationData?.artworkId;
    // Without an artwork ID we cannot safely assume two attempts concern the same item.
    group(id != null && id !== '' ? artworkGroups.get(String(id)) || `artwork-${id}` : `legacy-${message.id}`).legacy.push(message);
  }
  for (const [key, attempts] of groups) {
    attempts.contracts.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
    attempts.legacy.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
    const latest = attempts.contracts[attempts.contracts.length - 1];
    const legacy = attempts.legacy[attempts.legacy.length - 1];
    const timestamps = [...attempts.contracts.map(c => c.created_at), ...attempts.legacy.map(m => m.timestamp)].filter(value => Number.isFinite(Date.parse(value)));
    timestamps.sort((a, b) => Date.parse(a) - Date.parse(b));
    normal.push({ id: `negotiation-thread-${key}`, text: '', senderId: latest?.buyer_uid || legacy?.senderId || '',
      senderName: latest?.buyer || legacy?.senderName || '', timestamp: timestamps[0] || '', read: true,
      type: 'negotiation-thread', contract: latest, contractHistory: attempts.contracts, legacyHistory: attempts.legacy });
  }
  return normal.sort((a, b) => (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0) || a.id.localeCompare(b.id));
}

export type AttemptChange = { label: string; before: string; after: string };
function readable(value: unknown): string {
  if (value == null || value === '') return 'Not specified';
  if (Array.isArray(value)) return value.map(readable).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${readable(item)}`).join('\n');
  return String(value).replaceAll('_', ' ');
}
export function contractChanges(current: Contract, previous?: Contract): AttemptChange[] {
  if (current.revision_of && current.changes?.length) return current.changes;
  if (!previous) return [];
  const fields = { price: 'Checkout total (PHP)', license_type: 'License', exclusivity: 'Exclusivity',
    delivery_fee: 'Delivery fee (PHP)', delivery_details: 'Delivery details', compensation_type: 'Compensation',
    compensation_terms: 'Compensation details', terms: 'Terms' } as const;
  return Object.entries(fields).flatMap(([key, label]) => {
    const field = key as keyof typeof fields;
    const before = readable(previous[field]), after = readable(current[field]);
    return before === after ? [] : [{ label, before, after }];
  });
}

export function legacyChanges(current: ChatMessage, previous?: ChatMessage): AttemptChange[] {
  if (!previous) return [];
  const currentData = legacyProposal(current), previousData = legacyProposal(previous);
  const fields = { finalPrice: 'Artwork price (PHP)', licenseType: 'License', exclusivity: 'Exclusivity',
    durationMonths: 'Duration (months)', compensationCategory: 'Compensation', compensationTerms: 'Compensation details',
    royaltyPercentage: 'Royalty percentage', deliveryFee: 'Delivery fee (PHP)', note: 'Additional terms' };
  return Object.entries(fields).flatMap(([key, label]) => {
    const before = readable(previousData[key]), after = readable(currentData[key]);
    return before === after ? [] : [{ label, before, after }];
  });
}
