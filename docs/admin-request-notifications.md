# Admin request notifications

The admin header bell counts unread requests requiring attention. Pending decisions
are counted separately: reading a notice never approves, rejects, or completes it.
The Reseller, Attribution, Royalty, and Account action approval buttons also show
their own pending counts. These badges disappear when their queues have no
remaining pending items; simply reading a request clears the bell's unread count
but keeps its pending approval badge.

Opening the bell marks the current signed snapshot as read. A request arriving
after that snapshot remains unread. The list displays the latest 100 requests;
individual review queues contain the full records. The count refreshes every
15 seconds while the admin page is open.

Opening a review queue also acknowledges the records actually loaded there.
Paginated account queues acknowledge only loaded pages; transaction requests
are acknowledged when their tab is selected. Failed acknowledgements leave the
notice unread without blocking review work.

Read receipts are persisted per administrator in `AdminRequestRead`, so refreshing
or signing in again does not reset the count. Existing pending requests initially
appear unread. Resubmission or a tracked status transition produces a new notice.

The authenticated admin-only endpoint is
`/api/users/admin/request-notifications/`. GET is read-only. PATCH requires an
actor-bound signed snapshot and optionally a notification key or category and
displayed request IDs. The response includes counts, destinations, and generic
titles; uploaded documents and private application fields remain in protected
review endpoints.

Coverage includes reseller applications, royalty applications, attribution
reviews, failed provenance proofs, account action approvals, restriction appeals,
cancellation/return requests, royalty report reviews, and commission disputes or
payout failures. It does not count all ordinary user notifications.
