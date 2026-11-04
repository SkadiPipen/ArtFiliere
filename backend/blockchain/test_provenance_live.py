"""Opt-in integration test: writes random test identities on the existing LOCAL chain."""
import os
import time
from unittest import skipUnless
from django.test import TestCase
from django.conf import settings
from . import test_provenance as fixtures
from .ownership_chain import process_event, connection, artwork_id, account_id
from .provenance import queue_payment, public_record, check_checkout
from .models import ProvenanceListing
from artworks.models import Artwork


@skipUnless(os.environ.get('RUN_LOCAL_PROVENANCE_TESTS') == '1', 'Opt-in local blockchain integration')
class LocalOwnershipIntegration(TestCase):
    setUp = fixtures.ProvenanceTests.setUp
    agreement_for = fixtures.ProvenanceTests.agreement_for
    payment_for = fixtures.ProvenanceTests.payment_for
    def test_live_registration_exclusive_sale_and_resale(self):
        w3, registry = connection()
        self.assertEqual(w3.eth.chain_id, 31337, 'Live tests may run only against the local chain.')
        def reconcile(item):
            for _ in range(8):
                status = process_event(item.pk)
                if status == 'confirmed': break
                time.sleep(.2)
            item.refresh_from_db()
            self.assertEqual(item.status, 'confirmed', item.error)
            self.record.refresh_from_db()
        reconcile(self.record.events.get(kind='registration'))
        payment = self.payment_for()
        item = queue_payment(payment)
        self.assertEqual(self.record.current_owner_id, self.artist.pk)
        reconcile(item)
        self.assertEqual(self.record.current_owner_id, self.buyer.pk)
        # Resales also require seller-document approval, independent of ownership.
        from users.models import ResellerApplication
        ResellerApplication.objects.create(user=self.buyer, status='approved',
            tin_number='123456789', bir_certificate='test-document', bir_certificate_name='test.png')
        # A subsequent listing is a new offer for the SAME artwork, not a new registration.
        listing = Artwork.objects.create(artist=self.buyer, title='X resale', image_data=self.art.image_data, price=120, status='approved')
        ProvenanceListing.objects.create(artwork=listing, record=self.record)
        agreement = self.agreement_for(listing, self.buyer, self.next_buyer)
        check_checkout(agreement)
        reconcile(queue_payment(self.payment_for(agreement)))
        chain_record = registry.functions.artworks(artwork_id(self.record.pk)).call()
        self.assertEqual(bytes(chain_record[1]), account_id(self.artist.pk))
        self.assertEqual(bytes(chain_record[3]), account_id(self.next_buyer.pk))
        self.assertEqual(registry.functions.historyLength(artwork_id(self.record.pk)).call(), 3)
        self.assertEqual(public_record(self.record)['current_owner']['id'], self.next_buyer.pk)
