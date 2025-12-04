// RehabMonitorFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract RehabMonitorFHE is SepoliaConfig {
    struct EncryptedSessionData {
        uint256 id;
        euint32 encryptedExerciseType;
        euint32 encryptedRepetitions;
        euint32 encryptedRangeOfMotion;
        uint256 timestamp;
    }
    
    struct ProgressReport {
        euint32 encryptedImprovementScore;
        euint32 encryptedComplianceRate;
        euint32 encryptedPainLevel;
    }

    struct DecryptedSessionData {
        string exerciseType;
        uint32 repetitions;
        string rangeOfMotion;
        bool isRevealed;
    }

    uint256 public sessionCount;
    mapping(uint256 => EncryptedSessionData) public encryptedSessions;
    mapping(uint256 => DecryptedSessionData) public decryptedSessions;
    mapping(uint256 => ProgressReport) public progressReports;
    
    mapping(uint256 => uint256) private requestToSessionId;
    
    event SessionRecorded(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed sessionId);
    event ReportGenerated(uint256 indexed sessionId);
    event DecryptionRequested(uint256 indexed sessionId);
    event SessionDecrypted(uint256 indexed sessionId);
    
    modifier onlyPatient(uint256 sessionId) {
        _;
    }
    
    function recordEncryptedSession(
        euint32 encryptedExerciseType,
        euint32 encryptedRepetitions,
        euint32 encryptedRangeOfMotion
    ) public {
        sessionCount += 1;
        uint256 newId = sessionCount;
        
        encryptedSessions[newId] = EncryptedSessionData({
            id: newId,
            encryptedExerciseType: encryptedExerciseType,
            encryptedRepetitions: encryptedRepetitions,
            encryptedRangeOfMotion: encryptedRangeOfMotion,
            timestamp: block.timestamp
        });
        
        decryptedSessions[newId] = DecryptedSessionData({
            exerciseType: "",
            repetitions: 0,
            rangeOfMotion: "",
            isRevealed: false
        });
        
        emit SessionRecorded(newId, block.timestamp);
    }
    
    function requestSessionDecryption(uint256 sessionId) public onlyPatient(sessionId) {
        EncryptedSessionData storage session = encryptedSessions[sessionId];
        require(!decryptedSessions[sessionId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(session.encryptedExerciseType);
        ciphertexts[1] = FHE.toBytes32(session.encryptedRepetitions);
        ciphertexts[2] = FHE.toBytes32(session.encryptedRangeOfMotion);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptSession.selector);
        requestToSessionId[reqId] = sessionId;
        
        emit DecryptionRequested(sessionId);
    }
    
    function decryptSession(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 sessionId = requestToSessionId[requestId];
        require(sessionId != 0, "Invalid request");
        
        EncryptedSessionData storage eSession = encryptedSessions[sessionId];
        DecryptedSessionData storage dSession = decryptedSessions[sessionId];
        require(!dSession.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory exerciseType, uint32 repetitions, string memory rangeOfMotion) = abi.decode(cleartexts, (string, uint32, string));
        
        dSession.exerciseType = exerciseType;
        dSession.repetitions = repetitions;
        dSession.rangeOfMotion = rangeOfMotion;
        dSession.isRevealed = true;
        
        emit SessionDecrypted(sessionId);
    }
    
    function requestProgressAnalysis(uint256 sessionId) public onlyPatient(sessionId) {
        require(encryptedSessions[sessionId].id != 0, "Session not found");
        
        emit AnalysisRequested(sessionId);
    }
    
    function submitProgressReport(
        uint256 sessionId,
        euint32 encryptedImprovementScore,
        euint32 encryptedComplianceRate,
        euint32 encryptedPainLevel
    ) public {
        progressReports[sessionId] = ProgressReport({
            encryptedImprovementScore: encryptedImprovementScore,
            encryptedComplianceRate: encryptedComplianceRate,
            encryptedPainLevel: encryptedPainLevel
        });
        
        emit ReportGenerated(sessionId);
    }
    
    function requestReportDecryption(uint256 sessionId, uint8 metricType) public onlyPatient(sessionId) {
        ProgressReport storage report = progressReports[sessionId];
        require(FHE.isInitialized(report.encryptedImprovementScore), "No report available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (metricType == 0) {
            ciphertexts[0] = FHE.toBytes32(report.encryptedImprovementScore);
        } else if (metricType == 1) {
            ciphertexts[0] = FHE.toBytes32(report.encryptedComplianceRate);
        } else if (metricType == 2) {
            ciphertexts[0] = FHE.toBytes32(report.encryptedPainLevel);
        } else {
            revert("Invalid metric type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptProgressMetric.selector);
        requestToSessionId[reqId] = sessionId * 10 + metricType;
    }
    
    function decryptProgressMetric(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToSessionId[requestId];
        uint256 sessionId = compositeId / 10;
        uint8 metricType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 metric = abi.decode(cleartexts, (uint32));
    }
    
    function getDecryptedSession(uint256 sessionId) public view returns (
        string memory exerciseType,
        uint32 repetitions,
        string memory rangeOfMotion,
        bool isRevealed
    ) {
        DecryptedSessionData storage s = decryptedSessions[sessionId];
        return (s.exerciseType, s.repetitions, s.rangeOfMotion, s.isRevealed);
    }
    
    function hasProgressReport(uint256 sessionId) public view returns (bool) {
        return FHE.isInitialized(progressReports[sessionId].encryptedImprovementScore);
    }
}