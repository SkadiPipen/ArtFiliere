export function commissionStatusLabel(status: string) {
  return ({ NEGOTIATING: 'Reviewing proposal', PENDING: 'Request sent', SIGNING: 'Awaiting signatures', AWAITING_FUNDS: 'Awaiting payment', STAGE_1: 'Stage 1 · Sketch / Draft', STAGE_2: 'Stage 2 · WIP / Rendering', STAGE_3: 'Stage 3 · Final delivery', COMPLETE: 'Completed', CANCELLED: 'Cancelled', IN_PROGRESS: 'In progress' } as Record<string, string>)[status] || 'Commission in progress';
}

export function buyerMilestoneLabels(data: any, milestone: any) {
  let work = 'Not started';
  if (milestone.approved_at || milestone.status === 'APPROVED') work = 'Approved';
  else if (!data.funded_at) work = 'Waiting for verified funding';
  else if (milestone.status === 'REVISION_REQUESTED') work = 'Waiting for artist’s revised submission';
  else if (milestone.status === 'SUBMITTED') work = milestone.revision_used ? 'Revised submission ready for review' : 'Submission ready for review';
  else if (data.status === `STAGE_${milestone.number}`) work = 'Awaiting artist submission';
  let payout = data.funded_at ? 'Funds held' : 'Not funded';
  const status = milestone.payout_status;
  if (status === 'SUCCEEDED') payout = 'Payout confirmed';
  else if (status === 'PROCESSING') payout = 'Payout processing';
  else if (['FAILED', 'REJECTED'].includes(status)) payout = 'Payout failed · support review needed';
  else if (status === 'REVERSED') payout = 'Payout reversed · support review needed';
  else if (status === 'RECONCILE') payout = 'Payout under reconciliation';
  else if (status === 'RETRY_PENDING') payout = 'Payout confirmation pending';
  else if (status === 'CONFIG_REQUIRED') payout = 'Waiting for payout setup';
  else if (milestone.approved_at) payout = 'Approved · awaiting payout release';
  if (data.disputed && status !== 'SUCCEEDED') payout = 'Unreleased funds on hold for dispute review';
  const used = Boolean(milestone.revision_used || milestone.revision_requested_at);
  const revision = used ? 'Used · 1 of 1' : milestone.approved_at ? 'Unused · stage approved' : milestone.delivery_ready_at ? 'Closed after delivery approval' : 'Available · 1 of 1';
  return { work, payout, revision };
}

export function buyerCommissionFlow(data: any, now = Date.now()) {
  const milestones = data.milestones || [];
  const current = milestones.find((m: any) => !m.approved_at && m.status !== 'APPROVED');
  const final = milestones.find((m: any) => m.number === 3);
  const physical = String(data.art_type).toLowerCase() === 'physical';
  const finalSubmitted = Boolean(final?.submissions?.length || final?.status === 'SUBMITTED' || final?.delivery_ready_at || data.delivery);
  const step = data.status === 'COMPLETE' ? 5 : data.funded_at ? finalSubmitted ? 4 : 3 : data.fully_signed ? 2 : data.agreement_id ? 1 : 0;
  let title = 'Review the commission proposal';
  let description = 'Agree on the scope, delivery date, license, and milestones before signing.';
  let action = 'agreement';
  if (!data.agreement_id) {
    action = 'proposal';
    if (data.proposal?.is_proposer) { title = 'Your proposal is with the artist'; description = 'The artist can accept, decline, or send a counter-offer. You can review the proposal below.'; }
  } else if (!data.fully_signed) {
    title = 'Review and sign the agreement'; description = 'The artist signs first, followed by the buyer. Funding becomes available after both signatures are complete.';
  } else if (!data.funded_at) {
    const expired = Boolean(data.funding_due_at && new Date(data.funding_due_at).getTime() <= now);
    if (data.funding_pending) {
      title = 'Payment confirmation pending'; description = 'A checkout already exists. If you paid, wait for verification or refresh the payment status. Production begins only after confirmed payment.'; action = 'verify';
    } else if (expired) {
      title = 'The funding deadline has passed'; description = 'Refresh the commission status and contact the artist or Customer Service about the next steps.'; action = 'reload';
    } else if (data.status === 'AWAITING_FUNDS') {
      title = 'Both parties have signed. Fund the commission to begin.'; description = 'Fund the full agreed total once. Milestone payments are released separately as you approve the work.'; action = 'fund';
    } else {
      title = 'Agreement signed'; description = 'Waiting for the commission funding status to update.'; action = 'reload';
    }
  } else if (data.status === 'COMPLETE') {
    title = 'Your commission is completed'; description = physical ? 'Receipt and final inspection have been approved. Payout confirmation is shown separately for each stage.' : 'The final artwork is approved. Download the original from the final-stage files. Payout confirmation is shown separately.'; action = 'review';
  } else if (current?.status === 'SUBMITTED') {
    title = `Review ${current.label || `Stage ${current.number}`}`; action = 'review';
    description = current.revision_used ? 'Inspect the revised submission before approval. Your revision allowance is used; report any unresolved non-compliance through Need help.' : 'Inspect the submitted preview, then approve it or send your one consolidated revision request for this stage.';
    if (physical && current.number === 3) {
      if (data.delivered_at) { title = 'Inspect the delivered artwork'; description = 'You confirmed receipt. Inspect the artwork before approving the final milestone.'; }
      else if (data.delivery?.status === 'delivered' && data.delivery?.has_delivery_proof) { title = 'Confirm receipt and inspect the artwork'; description = 'The driver recorded delivery proof. Confirm only when you have received the artwork, then inspect it before final approval.'; }
      else if (current.delivery_ready_at) { title = 'Your artwork is being prepared or delivered'; description = 'Follow the delivery status below. Final approval stays locked until you confirm receipt and inspect the artwork.'; }
      else { title = 'Review the final preview before delivery'; description = 'Approve the artwork as ready for delivery first. This does not release the final payment. Receipt and inspection come after delivery.'; }
    } else if (current.number === 3) description = 'Inspect the final preview before approval. The original file unlocks after final approval under the agreed terms.';
  } else if (current?.status === 'REVISION_REQUESTED') {
    title = 'Waiting for the revised submission'; description = 'Your revision request has been sent. The artist’s reply and revised submission will appear under this stage.'; action = 'review';
  } else { title = 'Payment verified · awaiting artist submission'; description = 'The artist can now work on the active stage. You will review its submission before approving a release.'; action = 'review'; }
  if (data.disputed) { title = 'Dispute under review'; description = 'Customer Service is reviewing this commission. Unreleased funds and approval actions remain on hold.'; action = 'help'; }
  if (data.status === 'CANCELLED') { title = 'Commission cancelled'; description = 'The commission is closed. Contact Customer Service for any payment or refund questions.'; action = 'none'; }
  return { step, physical, title, description, action, milestoneId: current?.id ?? final?.id };
}
