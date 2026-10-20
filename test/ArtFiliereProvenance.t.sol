// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../contracts/ArtFiliereProvenance.sol";

contract Outsider {
    function attempt(ArtFiliereProvenance registry, bytes32 art) external returns (bool) {
        (bool ok,) = address(registry).call(abi.encodeWithSelector(registry.transfer.selector, art, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(9)), bytes32(uint256(8))));
        return ok;
    }
}
contract ArtFiliereProvenanceTest {
    ArtFiliereProvenance registry;
    bytes32 art = keccak256("X");
    bytes32 artist = keccak256("A");
    bytes32 buyer = keccak256("B");
    bytes32 nextBuyer = keccak256("C");
    function setUp() public {
        registry = new ArtFiliereProvenance();
        registry.register(art, keccak256("original"), artist, artist, keccak256("registration"), keccak256("claim"));
    }
    function testContinuousHistoryPreservesCreator() public {
        registry.transfer(art, artist, buyer, keccak256("sale1"), keccak256("terms1"));
        registry.transfer(art, buyer, nextBuyer, keccak256("sale2"), keccak256("terms2"));
        (, bytes32 creator, bytes32 initialOwner, bytes32 owner,) = registry.artworks(art);
        require(creator == artist && initialOwner == artist && owner == nextBuyer, "Attribution/owner incorrect");
        require(registry.historyLength(art) == 3, "History lost");
    }
    function testUnauthorizedTransferRejected() public {
        require(!new Outsider().attempt(registry, art), "Unauthorized transfer allowed");
    }
    function testDuplicateReferenceAndStaleOwnerRejected() public {
        bytes32 ref = keccak256("paid");
        registry.transfer(art, artist, buyer, ref, keccak256("terms"));
        (bool duplicate,) = address(registry).call(abi.encodeWithSelector(registry.transfer.selector, art, buyer, nextBuyer, ref, keccak256("terms")));
        require(!duplicate, "Duplicate reference allowed");
        (bool stale,) = address(registry).call(abi.encodeWithSelector(registry.transfer.selector, art, artist, nextBuyer, keccak256("stale"), keccak256("terms")));
        require(!stale && registry.historyLength(art) == 2, "Stale owner allowed");
    }
    function testReviewAppendsWithoutChangingOwnershipOrClaim() public {
        registry.review(art, keccak256("review"), keccak256("correction"));
        (, bytes32 creator,, bytes32 owner,) = registry.artworks(art);
        require(creator == artist && owner == artist && registry.historyLength(art) == 2, "Review overwrote history");
    }
}
