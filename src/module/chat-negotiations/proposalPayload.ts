export function proposalPayload(proposal: any, artType: string, revisionId?: number) {
  const total = Number(proposal.finalPrice) + Number(proposal.deliveryFee || 0);
  const terms = [
    `License: ${proposal.licenseType}`,
    `Exclusivity: ${proposal.exclusivity}`,
    `Product: ${artType}`,
    proposal.durationMonths ? `License duration: ${proposal.durationMonths} months` : 'License duration: no fixed duration specified',
    `Base price: PHP ${Number(proposal.basePrice).toFixed(2)}`,
    `License multiplier: ${proposal.licenseMultiplier}; exclusivity multiplier: ${proposal.exclusivityMultiplier}`,
    `Platform fee included: PHP ${Number(proposal.platformFee).toFixed(2)}`,
    proposal.requiresDelivery ? `Delivery: ${proposal.deliveryAddress}; PHP ${Number(proposal.deliveryFee).toFixed(2)}` : 'No shipping included',
    `Artwork checkout total: PHP ${total.toFixed(2)}`,
    proposal.note ? `Additional terms: ${proposal.note}` : '',
  ].filter(Boolean).join('\n');
  return {
    price: total.toFixed(2), terms, revision_of: revisionId,
    delivery_quote: proposal.deliveryQuote,
    license_type: proposal.licenseType, exclusivity: proposal.exclusivity.replace('-', '_'),
    delivery_type: artType, compensation_type: proposal.compensationCategory || 'one_time',
    compensation_terms: proposal.compensationTerms,
  };
}
