// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Platform account identifiers are hashes, not wallet addresses or personal data.
/// This records contractual entitlements; it does not establish authorship/copyright.
contract ArtFiliereProvenance {
    address public immutable operator;
    struct Artwork { bytes32 fileHash; bytes32 creator; bytes32 initialOwner; bytes32 owner; uint256 registeredAt; }
    struct Entry { bytes32 artworkId; bytes32 previousOwner; bytes32 newOwner; bytes32 recordHash; uint256 timestamp; uint8 kind; }
    mapping(bytes32 => Artwork) public artworks;
    mapping(bytes32 => Entry) public entries;
    mapping(bytes32 => bytes32[]) private history;
    event Recorded(bytes32 indexed artworkId, bytes32 indexed entryId, uint8 kind, bytes32 previousOwner, bytes32 newOwner, bytes32 recordHash);
    constructor() { operator = msg.sender; }
    modifier onlyOperator() { require(msg.sender == operator, "Platform operator only"); _; }
    function register(bytes32 id, bytes32 fileHash, bytes32 creator, bytes32 owner, bytes32 entryId, bytes32 recordHash) external onlyOperator {
        require(artworks[id].registeredAt == 0 && fileHash != 0 && creator != 0 && owner != 0, "Invalid registration");
        artworks[id] = Artwork(fileHash, creator, owner, owner, block.timestamp);
        append(id, entryId, 1, bytes32(0), owner, recordHash);
    }
    function transfer(bytes32 id, bytes32 previousOwner, bytes32 newOwner, bytes32 entryId, bytes32 termsHash) external onlyOperator {
        require(artworks[id].registeredAt != 0 && artworks[id].owner == previousOwner, "Owner mismatch");
        require(newOwner != 0 && newOwner != previousOwner, "Invalid recipient");
        artworks[id].owner = newOwner;
        append(id, entryId, 2, previousOwner, newOwner, termsHash);
    }
    function review(bytes32 id, bytes32 entryId, bytes32 recordHash) external onlyOperator {
        require(artworks[id].registeredAt != 0, "Not registered");
        append(id, entryId, 3, artworks[id].owner, artworks[id].owner, recordHash);
    }
    function append(bytes32 id, bytes32 entryId, uint8 kind, bytes32 previousOwner, bytes32 newOwner, bytes32 recordHash) private {
        require(entries[entryId].timestamp == 0, "Reference already recorded");
        entries[entryId] = Entry(id, previousOwner, newOwner, recordHash, block.timestamp, kind);
        history[id].push(entryId);
        emit Recorded(id, entryId, kind, previousOwner, newOwner, recordHash);
    }
    function historyLength(bytes32 id) external view returns (uint256) { return history[id].length; }
    function historyAt(bytes32 id, uint256 index) external view returns (bytes32) { return history[id][index]; }
}
