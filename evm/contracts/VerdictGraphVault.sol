// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VerdictGraphVault
/// @notice Deterministic native-GEN escrow for VerdictGraph handoffs.
/// @dev The GenLayer Intelligent Contract never custody-pushes payout value. It
///      sends a finality-only external message selecting one pre-registered
///      consequence rule. This contract performs exact arithmetic and exposes
///      pull withdrawals.
contract VerdictGraphVault {
    enum EscrowStatus {
        NONE,
        REGISTERED,
        FUNDED,
        ACTIVE,
        SETTLED,
        RECOVERED
    }

    uint256 public constant CONSEQUENCE_RELEASE_PROVIDER = 1;
    uint256 public constant CONSEQUENCE_PROVIDER_BREACH = 2;
    uint256 public constant CONSEQUENCE_NEUTRAL_RECOVERY = 3;

    struct HandoffEscrow {
        uint256 workflowId;
        string policyFingerprintSha256;
        address requester;
        address provider;
        uint256 principalRequired;
        uint256 providerBondRequired;
        uint256 fundingDeadline;
        uint256 recoveryDeadline;
        EscrowStatus status;
    }

    address public immutable registry_core;
    address public immutable adjudicator_core;

    mapping(uint256 => HandoffEscrow) public handoffs;
    mapping(uint256 => bool) public processedCases;
    mapping(address => uint256) public claimable;

    uint256 private _withdrawLock = 1;

    event HandoffRegistrationIgnored(uint256 indexed handoffId, string reason);
    event HandoffRegistered(
        uint256 indexed workflowId,
        uint256 indexed handoffId,
        address indexed requester,
        address provider,
        string policyFingerprintSha256,
        uint256 principalRequired,
        uint256 providerBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline
    );
    event PrincipalFunded(uint256 indexed handoffId, address indexed requester, uint256 amount);
    event ProviderBondPosted(uint256 indexed handoffId, address indexed provider, uint256 amount);
    event HandoffCompleted(uint256 indexed workflowId, uint256 indexed handoffId, string deliverySha256);
    event CompletionIgnored(uint256 indexed handoffId, string reason);
    event VerdictApplied(
        uint256 indexed caseId,
        uint256 indexed workflowId,
        uint256 indexed handoffId,
        uint256 consequenceRuleId,
        string verdictSha256
    );
    event VerdictIgnored(uint256 indexed caseId, uint256 indexed handoffId, string reason);
    event EscrowRecovered(uint256 indexed handoffId, string reason);
    event Withdrawal(address indexed account, uint256 amount);

    error OnlyRegistryCore();
    error OnlyAdjudicatorCore();
    error InvalidCore();
    error InvalidParticipant();
    error InvalidTerms();
    error AlreadyRegistered();
    error UnknownHandoff();
    error WrongRequester();
    error WrongProvider();
    error WrongAmount();
    error WrongState();
    error FundingWindowClosed();
    error RecoveryNotReady();
    error InvalidConsequence();
    error NothingToWithdraw();
    error WithdrawalFailed();
    error ReentrantCall();

    modifier onlyRegistryCore() {
        if (msg.sender != registry_core) revert OnlyRegistryCore();
        _;
    }

    modifier onlyAdjudicatorCore() {
        if (msg.sender != adjudicator_core) revert OnlyAdjudicatorCore();
        _;
    }

    modifier nonReentrant() {
        if (_withdrawLock != 1) revert ReentrantCall();
        _withdrawLock = 2;
        _;
        _withdrawLock = 1;
    }

    constructor(address registryCore_, address adjudicatorCore_) {
        if (registryCore_ == address(0) || adjudicatorCore_ == address(0)) revert InvalidCore();
        registry_core = registryCore_;
        adjudicator_core = adjudicatorCore_;
    }

    /// @notice GenLayer EVM-interface compatible Registry controller getter.
    function registryCore() external view returns (address) {
        return registry_core;
    }

    /// @notice GenLayer EVM-interface compatible Adjudicator controller getter.
    function adjudicatorCore() external view returns (address) {
        return adjudicator_core;
    }

    /// @notice Registers exact escrow terms chosen by VerdictGraph Registry.
    /// @dev Called by a finality-only external message from the Core ghost.
    function register_handoff(
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        address requester,
        address provider,
        uint256 principalRequired,
        uint256 providerBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline
    ) external onlyRegistryCore {
        _registerHandoff(
            workflowId,
            handoffId,
            policyFingerprintSha256,
            requester,
            provider,
            principalRequired,
            providerBondRequired,
            fundingDeadline,
            recoveryDeadline
        );
    }

    function registerHandoff(
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        address requester,
        address provider,
        uint256 principalRequired,
        uint256 providerBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline
    ) external onlyRegistryCore {
        _registerHandoff(
            workflowId,
            handoffId,
            policyFingerprintSha256,
            requester,
            provider,
            principalRequired,
            providerBondRequired,
            fundingDeadline,
            recoveryDeadline
        );
    }

    function _registerHandoff(
        uint256 workflowId,
        uint256 handoffId,
        string memory policyFingerprintSha256,
        address requester,
        address provider,
        uint256 principalRequired,
        uint256 providerBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline
    ) internal {
        HandoffEscrow storage existing = handoffs[handoffId];
        if (existing.status != EscrowStatus.NONE) {
            bool sameTerms = existing.workflowId == workflowId
                && keccak256(bytes(existing.policyFingerprintSha256)) == keccak256(bytes(policyFingerprintSha256))
                && existing.requester == requester && existing.provider == provider
                && existing.principalRequired == principalRequired
                && existing.providerBondRequired == providerBondRequired && existing.fundingDeadline == fundingDeadline
                && existing.recoveryDeadline == recoveryDeadline;
            if (!sameTerms) revert AlreadyRegistered();
            emit HandoffRegistrationIgnored(handoffId, "IDENTICAL_TERMS_ALREADY_REGISTERED");
            return;
        }
        if (requester == address(0) || provider == address(0) || requester == provider) revert InvalidParticipant();
        if (
            !_isLowerHexSha256(policyFingerprintSha256) || principalRequired == 0 || providerBondRequired == 0
                || fundingDeadline <= block.timestamp || recoveryDeadline <= fundingDeadline
        ) revert InvalidTerms();

        handoffs[handoffId] = HandoffEscrow({
            workflowId: workflowId,
            policyFingerprintSha256: policyFingerprintSha256,
            requester: requester,
            provider: provider,
            principalRequired: principalRequired,
            providerBondRequired: providerBondRequired,
            fundingDeadline: fundingDeadline,
            recoveryDeadline: recoveryDeadline,
            status: EscrowStatus.REGISTERED
        });

        emit HandoffRegistered(
            workflowId,
            handoffId,
            requester,
            provider,
            policyFingerprintSha256,
            principalRequired,
            providerBondRequired,
            fundingDeadline,
            recoveryDeadline
        );
    }

    function handoff_status(uint256 handoffId) external view returns (uint256) {
        return uint256(handoffs[handoffId].status);
    }

    /// @notice GenLayer EVM-interface compatible handoff status getter.
    function handoffStatus(uint256 handoffId) external view returns (uint256) {
        return uint256(handoffs[handoffId].status);
    }

    function fund_handoff(uint256 handoffId) external payable {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (escrow.status != EscrowStatus.REGISTERED) revert WrongState();
        if (msg.sender != escrow.requester) revert WrongRequester();
        if (block.timestamp > escrow.fundingDeadline) revert FundingWindowClosed();
        if (msg.value != escrow.principalRequired) revert WrongAmount();

        escrow.status = EscrowStatus.FUNDED;
        emit PrincipalFunded(handoffId, msg.sender, msg.value);
    }

    function post_bond(uint256 handoffId) external payable {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (escrow.status != EscrowStatus.FUNDED) revert WrongState();
        if (msg.sender != escrow.provider) revert WrongProvider();
        if (block.timestamp > escrow.fundingDeadline) revert FundingWindowClosed();
        if (msg.value != escrow.providerBondRequired) revert WrongAmount();

        escrow.status = EscrowStatus.ACTIVE;
        emit ProviderBondPosted(handoffId, msg.sender, msg.value);
    }

    /// @notice Releases a successfully accepted handoff without invoking dispute adjudication.
    /// @dev Called only by the finalized Registry message after the requester explicitly
    ///      accepts the provider's immutable, hash-pinned delivery. Idempotent for
    ///      duplicate finality delivery.
    function apply_handoff_completion(
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        string calldata deliverySha256
    ) external onlyRegistryCore {
        _applyHandoffCompletion(workflowId, handoffId, policyFingerprintSha256, deliverySha256);
    }

    function applyHandoffCompletion(
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        string calldata deliverySha256
    ) external onlyRegistryCore {
        _applyHandoffCompletion(workflowId, handoffId, policyFingerprintSha256, deliverySha256);
    }

    function _applyHandoffCompletion(
        uint256 workflowId,
        uint256 handoffId,
        string memory policyFingerprintSha256,
        string memory deliverySha256
    ) internal {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (escrow.workflowId != workflowId) revert InvalidTerms();
        if (keccak256(bytes(escrow.policyFingerprintSha256)) != keccak256(bytes(policyFingerprintSha256))) {
            revert InvalidTerms();
        }
        if (!_isLowerHexSha256(deliverySha256)) revert InvalidTerms();

        if (escrow.status == EscrowStatus.SETTLED || escrow.status == EscrowStatus.RECOVERED) {
            emit CompletionIgnored(handoffId, "ESCROW_ALREADY_TERMINAL");
            return;
        }
        if (escrow.status != EscrowStatus.ACTIVE) {
            emit CompletionIgnored(handoffId, "ESCROW_NOT_ACTIVE");
            return;
        }

        claimable[escrow.provider] += escrow.principalRequired + escrow.providerBondRequired;
        escrow.status = EscrowStatus.SETTLED;

        emit HandoffCompleted(workflowId, handoffId, deliverySha256);
    }

    /// @notice Applies one exact, pre-agreed consequence selected by GenLayer.
    /// @dev Idempotent for duplicate/late messages; a recovered escrow cannot be
    ///      reopened by a later verdict.
    function apply_final_verdict(
        uint256 caseId,
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        uint256 consequenceRuleId,
        string calldata verdictSha256
    ) external onlyAdjudicatorCore {
        _applyFinalVerdict(caseId, workflowId, handoffId, policyFingerprintSha256, consequenceRuleId, verdictSha256);
    }

    function applyFinalVerdict(
        uint256 caseId,
        uint256 workflowId,
        uint256 handoffId,
        string calldata policyFingerprintSha256,
        uint256 consequenceRuleId,
        string calldata verdictSha256
    ) external onlyAdjudicatorCore {
        _applyFinalVerdict(caseId, workflowId, handoffId, policyFingerprintSha256, consequenceRuleId, verdictSha256);
    }

    function _applyFinalVerdict(
        uint256 caseId,
        uint256 workflowId,
        uint256 handoffId,
        string memory policyFingerprintSha256,
        uint256 consequenceRuleId,
        string memory verdictSha256
    ) internal {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (escrow.workflowId != workflowId) revert InvalidTerms();
        if (keccak256(bytes(escrow.policyFingerprintSha256)) != keccak256(bytes(policyFingerprintSha256))) {
            revert InvalidTerms();
        }

        if (!_isLowerHexSha256(verdictSha256)) revert InvalidTerms();

        if (processedCases[caseId]) {
            emit VerdictIgnored(caseId, handoffId, "CASE_ALREADY_PROCESSED");
            return;
        }
        processedCases[caseId] = true;

        if (escrow.status == EscrowStatus.SETTLED || escrow.status == EscrowStatus.RECOVERED) {
            emit VerdictIgnored(caseId, handoffId, "ESCROW_ALREADY_TERMINAL");
            return;
        }
        if (escrow.status != EscrowStatus.ACTIVE) {
            emit VerdictIgnored(caseId, handoffId, "ESCROW_NOT_ACTIVE");
            return;
        }

        if (consequenceRuleId < CONSEQUENCE_RELEASE_PROVIDER || consequenceRuleId > CONSEQUENCE_NEUTRAL_RECOVERY) {
            revert InvalidConsequence();
        }

        uint256 principal = escrow.principalRequired;
        uint256 bond = escrow.providerBondRequired;

        if (consequenceRuleId == CONSEQUENCE_RELEASE_PROVIDER) {
            claimable[escrow.provider] += principal + bond;
        } else if (consequenceRuleId == CONSEQUENCE_PROVIDER_BREACH) {
            claimable[escrow.requester] += principal + bond;
        } else {
            claimable[escrow.requester] += principal;
            claimable[escrow.provider] += bond;
        }

        escrow.status = EscrowStatus.SETTLED;
        emit VerdictApplied(caseId, workflowId, handoffId, consequenceRuleId, verdictSha256);
    }

    /// @notice Refunds principal if the provider never posts the required bond.
    function recover_unactivated(uint256 handoffId) external {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (block.timestamp <= escrow.fundingDeadline) revert RecoveryNotReady();

        if (escrow.status == EscrowStatus.REGISTERED) {
            escrow.status = EscrowStatus.RECOVERED;
            emit EscrowRecovered(handoffId, "UNFUNDED_EXPIRED");
            return;
        }
        if (escrow.status != EscrowStatus.FUNDED) revert WrongState();

        claimable[escrow.requester] += escrow.principalRequired;
        escrow.status = EscrowStatus.RECOVERED;
        emit EscrowRecovered(handoffId, "BOND_NOT_POSTED");
    }

    /// @notice Neutral recovery after the maximum settlement horizon.
    function recover_active(uint256 handoffId) external {
        HandoffEscrow storage escrow = _handoff(handoffId);
        if (escrow.status != EscrowStatus.ACTIVE) revert WrongState();
        if (block.timestamp <= escrow.recoveryDeadline) revert RecoveryNotReady();

        claimable[escrow.requester] += escrow.principalRequired;
        claimable[escrow.provider] += escrow.providerBondRequired;
        escrow.status = EscrowStatus.RECOVERED;
        emit EscrowRecovered(handoffId, "FINAL_VERDICT_DEADLINE_EXPIRED");
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        claimable[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawalFailed();

        emit Withdrawal(msg.sender, amount);
    }

    function _isLowerHexSha256(string memory value) internal pure returns (bool) {
        bytes memory data = bytes(value);
        if (data.length != 64) return false;

        for (uint256 i = 0; i < data.length; i++) {
            uint8 c = uint8(data[i]);
            bool isDigit = c >= 48 && c <= 57;
            bool isLowerHexLetter = c >= 97 && c <= 102;
            if (!isDigit && !isLowerHexLetter) return false;
        }
        return true;
    }

    function _handoff(uint256 handoffId) internal view returns (HandoffEscrow storage escrow) {
        escrow = handoffs[handoffId];
        if (escrow.status == EscrowStatus.NONE) revert UnknownHandoff();
    }

    fallback() external {
        revert();
    }
}
