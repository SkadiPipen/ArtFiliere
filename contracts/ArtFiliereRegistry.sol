// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stores compact, tamper-evident proofs only. Full records remain in PostgreSQL.
contract ArtFiliereRegistry {
    struct Artwork {
        bytes32 artworkHash;
        address registeredBy;
        uint256 timestamp;
        bool exists;
    }

    struct Proof {
        bytes32 recordHash;
        address recordedBy;
        uint256 timestamp;
        bool exists;
    }

    mapping(uint256 => Artwork) public artworks;
    mapping(uint256 => Proof) private licenseProofs;
    mapping(uint256 => Proof) private saleProofs;

    event ArtworkRegistered(uint256 indexed artworkId, bytes32 artworkHash, address indexed registeredBy, uint256 timestamp);
    event LicenseRecorded(uint256 indexed agreementId, bytes32 documentHash, address indexed recordedBy, uint256 timestamp);
    event ArtworkSold(uint256 indexed paymentId, bytes32 saleHash, address indexed recordedBy, uint256 timestamp);

    function registerArtwork(uint256 artworkId, bytes32 artworkHash) external {
        require(!artworks[artworkId].exists, "Already registered");
        artworks[artworkId] = Artwork(artworkHash, msg.sender, block.timestamp, true);
        emit ArtworkRegistered(artworkId, artworkHash, msg.sender, block.timestamp);
    }

    function getArtwork(uint256 id) external view returns (bytes32, address, uint256, bool) {
        Artwork memory a = artworks[id];
        return (a.artworkHash, a.registeredBy, a.timestamp, a.exists);
    }

    function verifyArtwork(uint256 id, bytes32 h) external view returns (bool) {
        return artworks[id].exists && artworks[id].artworkHash == h;
    }

    function recordLicense(uint256 agreementId, bytes32 documentHash) external {
        require(!licenseProofs[agreementId].exists, "License already recorded");
        licenseProofs[agreementId] = Proof(documentHash, msg.sender, block.timestamp, true);
        emit LicenseRecorded(agreementId, documentHash, msg.sender, block.timestamp);
    }

    function recordSale(uint256 paymentId, bytes32 saleHash) external {
        require(!saleProofs[paymentId].exists, "Sale already recorded");
        saleProofs[paymentId] = Proof(saleHash, msg.sender, block.timestamp, true);
        emit ArtworkSold(paymentId, saleHash, msg.sender, block.timestamp);
    }

    function getLicense(uint256 agreementId) external view returns (bytes32, address, uint256, bool) {
        Proof memory proof = licenseProofs[agreementId];
        return (proof.recordHash, proof.recordedBy, proof.timestamp, proof.exists);
    }

    function getSale(uint256 paymentId) external view returns (bytes32, address, uint256, bool) {
        Proof memory proof = saleProofs[paymentId];
        return (proof.recordHash, proof.recordedBy, proof.timestamp, proof.exists);
    }

    function verifyLicense(uint256 agreementId, bytes32 documentHash) external view returns (bool) {
        return licenseProofs[agreementId].exists && licenseProofs[agreementId].recordHash == documentHash;
    }

    function verifySale(uint256 paymentId, bytes32 saleHash) external view returns (bool) {
        return saleProofs[paymentId].exists && saleProofs[paymentId].recordHash == saleHash;
    }
}
