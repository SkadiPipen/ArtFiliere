from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from .service import BlockchainError, artwork_registry_key, register_artwork, verify_artwork, _send


class RegistrationIdentityTests(SimpleTestCase):
    def setUp(self):
        self.chain = MagicMock()
        self.registry = MagicMock()
        self.digest = 'ab' * 32
        self.empty = (bytes(32), '', 0, False)
        self.stored = (bytes.fromhex(self.digest), 'sender', 123, True)

    def test_reused_database_id_registers_separate_content_identity(self):
        self.registry.functions.getArtwork.return_value.call.side_effect = [
            (bytes.fromhex('cd' * 32), 'sender', 1, True), self.empty]
        with patch('blockchain.service.contract', return_value=(self.chain, self.registry)), patch('blockchain.service._send', return_value={'block_number': 7}) as send:
            self.assertEqual(register_artwork(41, self.digest), {'block_number': 7})
            send.call_args.args[0](self.registry)
        self.registry.functions.registerArtwork.assert_called_once_with(
            artwork_registry_key(41, self.digest), bytes.fromhex(self.digest))

    def test_legacy_matching_proof_recovers_receipt_without_writing(self):
        self.registry.functions.getArtwork.return_value.call.return_value = self.stored
        self.registry.events.ArtworkRegistered.return_value.get_logs.return_value = [{'transactionHash': bytes.fromhex('12' * 32)}]
        self.chain.eth.get_transaction_receipt.return_value = MagicMock(status=1, blockNumber=49)
        with patch('blockchain.service.contract', return_value=(self.chain, self.registry)), patch('blockchain.service._send') as send:
            self.assertEqual(register_artwork(41, self.digest)['block_number'], 49)
            send.assert_not_called()
        self.registry.events.ArtworkRegistered.return_value.get_logs.assert_called_once_with(
            from_block=0, to_block='latest', argument_filters={'artworkId': 41})

    def test_verification_checks_content_identity_after_legacy_conflict(self):
        self.registry.functions.getArtwork.return_value.call.side_effect = [self.empty, self.stored]
        with patch('blockchain.service.contract', return_value=(self.chain, self.registry)):
            self.assertTrue(verify_artwork(41, self.digest)[0])

    def test_failed_receipt_keeps_transaction_hash_and_block(self):
        from django.test import override_settings
        self.chain.eth.account.from_key.return_value.address = 'sender'
        self.chain.eth.get_transaction_count.return_value = 0
        self.chain.eth.send_raw_transaction.return_value = bytes.fromhex('34' * 32)
        self.chain.eth.wait_for_transaction_receipt.return_value = MagicMock(status=0, blockNumber=87)
        with override_settings(BLOCKCHAIN_PRIVATE_KEY='test', BLOCKCHAIN_CHAIN_ID=31337), patch('blockchain.service.contract', return_value=(self.chain, self.registry)), patch('django.db.transaction.atomic'), patch('blockchain.models.ProvenanceSigner.objects') as signers, patch('blockchain.models.ProvenanceEvent.objects') as events:
            signers.get_or_create.return_value = (MagicMock(pk=1), True)
            events.filter.return_value.exclude.return_value.exclude.return_value = []
            with self.assertRaises(BlockchainError) as caught:
                _send(lambda registry: registry.functions.registerArtwork(41, bytes.fromhex(self.digest)))
        self.assertEqual(caught.exception.transaction_hash, '34' * 32)
        self.assertEqual(caught.exception.block_number, 87)
