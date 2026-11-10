# Database table names

Business tables use singular snake_case names, declared through Django `Meta.db_table`. Python model names, API routes, fields and relationships are unchanged. Django internal tables retain their framework names.

The `simplify_table_names` migrations use reversible `AlterModelTable` operations to preserve rows and foreign keys. Run `venv/Scripts/python.exe manage.py migrate` from `backend` when deploying to another database. Deploy model changes and migrations together.

Both delivery implementations remain referenced. The `delivery` app uses `legacy_delivery_order` and `legacy_rider_profile`; the `fulfillment` app uses `delivery_order` and `rider_profile`. No tables were deleted or merged.

| Django model | Database table |
| --- | --- |
| `artist_applications.ArtistApplication` | `artist_application` |
| `artist_applications.ArtistRegistrationUpdate` | `artist_registration_update` |
| `artist_applications.ArtistApplicationLog` | `artist_application_log` |
| `artworks.Artwork` | `artwork` |
| `artworks.ArtworkReviewLog` | `artwork_review_log` |
| `artworks.ArtworkAIScan` | `artwork_ai_scan` |
| `artworks.ArtworkSimilarityMatch` | `artwork_similarity_match` |
| `auctions.AuctionListing` | `auction` |
| `auctions.Bid` | `auction_bid` |
| `blockchain.BlockchainTransaction` | `blockchain_transaction` |
| `blockchain.ProvenanceArtwork` | `provenance_artwork` |
| `blockchain.ProvenanceListing` | `provenance_listing` |
| `blockchain.ProvenanceEvent` | `provenance_event` |
| `blockchain.ProvenanceReview` | `provenance_review` |
| `blockchain.ProvenanceSigner` | `provenance_signer` |
| `blockchain.SaleTermsSnapshot` | `sale_terms_snapshot` |
| `cart.Cart` | `cart` |
| `cart.CartItem` | `cart_item` |
| `commissions.CommissionRequest` | `commission` |
| `commissions.CommissionMilestone` | `commission_milestone` |
| `commissions.CommissionPhoto` | `commission_photo` |
| `commissions.CommissionMessage` | `commission_message` |
| `commissions.CommissionAccessDecision` | `commission_access_decision` |
| `commissions.CommissionProposal` | `commission_proposal` |
| `commissions.CommissionSubmission` | `commission_submission` |
| `commissions.CommissionPayoutProfile` | `commission_payout_profile` |
| `commissions.CommissionLedger` | `commission_entry` |
| `commissions.CommissionAsset` | `commission_asset` |
| `commissions.CommissionResale` | `commission_resale` |
| `commissions.CommissionRefund` | `commission_refund` |
| `commissions.CommissionProof` | `commission_proof` |
| `delivery.RiderProfile` | `legacy_rider_profile` |
| `delivery.Order` | `legacy_delivery_order` |
| `fulfillment.DownloadFingerprint` | `download_fingerprint` |
| `fulfillment.DeliveryChat` | `delivery_chat` |
| `fulfillment.CertificateOfAuthenticity` | `authenticity_certificate` |
| `fulfillment.DeliveryRoute` | `delivery_route` |
| `fulfillment.DeliveryOrder` | `delivery_order` |
| `fulfillment.PurchaseReview` | `purchase_review` |
| `fulfillment.RiderProfile` | `rider_profile` |
| `messaging.DirectMessage` | `direct_message` |
| `messaging.Conversation` | `conversation` |
| `messaging.ConversationParticipant` | `conversation_participant` |
| `messaging.PlatformDefaults` | `platform_setting` |
| `messaging.AgreementTemplate` | `agreement_template` |
| `messaging.Agreement` | `agreement` |
| `messaging.Message` | `message` |
| `messaging.RoyaltyPeriod` | `royalty_period` |
| `messaging.RoyaltyMandate` | `royalty_mandate` |
| `messaging.RoyaltyReceipt` | `royalty_receipt` |
| `messaging.RoyaltyFunding` | `royalty_funding` |
| `notifications.AdminRequestRead` | `admin_request_read` |
| `notifications.UserNotification` | `notification` |
| `users.ModeratorApplication` | `moderator_application` |
| `users.ModeratorApplicationReview` | `moderator_application_review` |
| `users.User` | `user` |
| `users.RoyaltyApplication` | `royalty_application` |
| `users.ResellerApplication` | `reseller_application` |
| `users.ResellerReview` | `reseller_application_review` |
| `users.Address` | `user_address` |
| `users.ActivityLog` | `user_activity_log` |
| `wallets.SupportTicket` | `support_ticket` |
| `wallets.SupportReply` | `support_reply` |
| `wallets.AccountModerationRequest` | `account_moderation_request` |
| `wallets.WalletAccount` | `wallet` |
| `wallets.PaymentSession` | `payment` |
| `wallets.CancellationReturnRequest` | `payment_return_request` |
| `wallets.IncidentReport` | `incident_report` |
| `wallets.ReportAttachment` | `report_attachment` |
| `wallets.AccountActionRequest` | `account_action_request` |
| `wallets.RestrictionAppeal` | `restriction_appeal` |
| `wallets.FinancialAuthorization` | `financial_authorization` |
| `wallets.WalletLedgerEntry` | `wallet_entry` |
