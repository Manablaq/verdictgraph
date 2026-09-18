// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VerdictGraphMilestoneVault
/// @notice Deterministic native-GEN custody for GenLayer-reviewed milestones.
/// @dev The Milestone Registry Intelligent Contract is the sole custody
///      controller. The separate Adjudicator returns reviews to the Registry;
///      this contract performs no subjective evaluation or model arithmetic.
contract VerdictGraphMilestoneVault {
    enum EscrowStatus {
        NONE,
        REGISTERED,
        FUNDED,
        ACTIVE,
        SETTLED,
        RECOVERED
    }

    uint256 public constant CONSEQUENCE_PASS = 1;
    uint256 public constant CONSEQUENCE_FAIL = 2;
    uint256 public constant CONSEQUENCE_NEUTRAL = 3;

    struct MilestoneEscrow {
        address owner;
        address beneficiary;
        uint256 principalRequired;
        uint256 beneficiaryBondRequired;
        uint256 fundingDeadline;
        uint256 recoveryDeadline;
        string termsSha256;
        EscrowStatus status;
    }

    address public immutable milestone_registry;

    mapping(uint256 => MilestoneEscrow) public milestones;
    mapping(uint256 => bool) public processedMilestones;
    mapping(address => uint256) public claimable;

    uint256 private _withdrawLock = 1;

    event MilestoneRegistrationIgnored(uint256 indexed milestoneId, string reason);
    event MilestoneRegistered(
        uint256 indexed milestoneId,
        address indexed owner,
        address indexed beneficiary,
        uint256 principalRequired,
        uint256 beneficiaryBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline,
        string termsSha256
    );
    event PrincipalFunded(uint256 indexed milestoneId, address indexed owner, uint256 amount);
    event BeneficiaryBondPosted(uint256 indexed milestoneId, address indexed beneficiary, uint256 amount);
    event OutcomeApplied(
        uint256 indexed milestoneId,
        uint256 indexed reviewId,
        uint256 consequenceRuleId,
        string reviewSha256
    );
    event OutcomeIgnored(uint256 indexed milestoneId, string reason);
    event MilestoneRecovered(uint256 indexed milestoneId, string reason);
    event Withdrawal(address indexed account, uint256 amount);

    error OnlyMilestoneRegistry();
    error InvalidCore();
    error InvalidParticipant();
    error InvalidTerms();
    error AlreadyRegistered();
    error UnknownMilestone();
    error WrongOwner();
    error WrongBeneficiary();
    error WrongAmount();
    error WrongState();
    error FundingWindowClosed();
    error RecoveryNotReady();
    error PayoutOverflow();
    error InvalidConsequence();
    error NothingToWithdraw();
    error WithdrawalFailed();
    error ReentrantCall();

    modifier onlyMilestoneRegistry() {
        if (msg.sender != milestone_registry) revert OnlyMilestoneRegistry();
        _;
    }

    modifier nonReentrant() {
        if (_withdrawLock != 1) revert ReentrantCall();
        _withdrawLock = 2;
        _;
        _withdrawLock = 1;
    }

    constructor(address milestoneRegistry_) {
        if (milestoneRegistry_ == address(0)) revert InvalidCore();
        milestone_registry = milestoneRegistry_;
    }

    /// @notice GenLayer EVM-interface-compatible controller getter.
    function milestone_core() external view returns (address) {
        return milestone_registry;
    }

    /// @notice Explicit Registry getter for the split milestone topology.
    function milestoneRegistry() external view returns (address) {
        return milestone_registry;
    }

    function register_milestone(
        uint256 milestoneId,
        address owner,
        address beneficiary,
        uint256 principalRequired,
        uint256 beneficiaryBondRequired,
        uint256 fundingDeadline,
        uint256 recoveryDeadline,
        string calldata termsSha256
    ) external onlyMilestoneRegistry {
        if (owner == address(0) || beneficiary == address(0) || owner == beneficiary) {
            revert InvalidParticipant();
        }
        if (principalRequired == 0 || beneficiaryBondRequired == 0) revert InvalidTerms();
        if (type(uint256).max - principalRequired < beneficiaryBondRequired) revert PayoutOverflow();
        if (fundingDeadline <= block.timestamp || recoveryDeadline <= fundingDeadline) {
            revert InvalidTerms();
        }
        if (!_isLowerHexSha256(termsSha256)) revert InvalidTerms();

        MilestoneEscrow storage existing = milestones[milestoneId];
        if (existing.status != EscrowStatus.NONE) {
            if (
                existing.owner == owner &&
                existing.beneficiary == beneficiary &&
                existing.principalRequired == principalRequired &&
                existing.beneficiaryBondRequired == beneficiaryBondRequired &&
                existing.fundingDeadline == fundingDeadline &&
                existing.recoveryDeadline == recoveryDeadline &&
                keccak256(bytes(existing.termsSha256)) == keccak256(bytes(termsSha256))
            ) {
                emit MilestoneRegistrationIgnored(milestoneId, "IDENTICAL_TERMS_ALREADY_REGISTERED");
                return;
            }
            revert AlreadyRegistered();
        }

        milestones[milestoneId] = MilestoneEscrow({
            owner: owner,
            beneficiary: beneficiary,
            principalRequired: principalRequired,
            beneficiaryBondRequired: beneficiaryBondRequired,
            fundingDeadline: fundingDeadline,
            recoveryDeadline: recoveryDeadline,
            termsSha256: termsSha256,
            status: EscrowStatus.REGISTERED
        });
        emit MilestoneRegistered(
            milestoneId,
            owner,
            beneficiary,
            principalRequired,
            beneficiaryBondRequired,
            fundingDeadline,
            recoveryDeadline,
            termsSha256
        );
    }

    function milestone_status(uint256 milestoneId) external view returns (uint256) {
        return uint256(_milestone(milestoneId).status);
    }

    function milestoneStatus(uint256 milestoneId) external view returns (uint256) {
        return uint256(_milestone(milestoneId).status);
    }

    function fund_milestone(uint256 milestoneId) external payable {
        MilestoneEscrow storage milestone = _milestone(milestoneId);
        if (msg.sender != milestone.owner) revert WrongOwner();
        if (milestone.status != EscrowStatus.REGISTERED) revert WrongState();
        if (block.timestamp > milestone.fundingDeadline) revert FundingWindowClosed();
        if (msg.value != milestone.principalRequired) revert WrongAmount();
        milestone.status = EscrowStatus.FUNDED;
        emit PrincipalFunded(milestoneId, msg.sender, msg.value);
    }

    function post_bond(uint256 milestoneId) external payable {
        MilestoneEscrow storage milestone = _milestone(milestoneId);
        if (msg.sender != milestone.beneficiary) revert WrongBeneficiary();
        if (milestone.status != EscrowStatus.FUNDED) revert WrongState();
        if (block.timestamp > milestone.fundingDeadline) revert FundingWindowClosed();
        if (msg.value != milestone.beneficiaryBondRequired) revert WrongAmount();
        milestone.status = EscrowStatus.ACTIVE;
        emit BeneficiaryBondPosted(milestoneId, msg.sender, msg.value);
    }

    function apply_final_outcome(
        uint256 milestoneId,
        uint256 reviewId,
        string calldata termsSha256,
        uint256 consequenceRuleId,
        string calldata reviewSha256
    ) external onlyMilestoneRegistry {
        _applyFinalOutcome(milestoneId, reviewId, termsSha256, consequenceRuleId, reviewSha256);
    }

    function applyFinalOutcome(
        uint256 milestoneId,
        uint256 reviewId,
        string calldata termsSha256,
        uint256 consequenceRuleId,
        string calldata reviewSha256
    ) external onlyMilestoneRegistry {
        _applyFinalOutcome(milestoneId, reviewId, termsSha256, consequenceRuleId, reviewSha256);
    }

    function _applyFinalOutcome(
        uint256 milestoneId,
        uint256 reviewId,
        string calldata termsSha256,
        uint256 consequenceRuleId,
        string calldata reviewSha256
    ) internal {
        MilestoneEscrow storage milestone = _milestone(milestoneId);
        if (keccak256(bytes(milestone.termsSha256)) != keccak256(bytes(termsSha256))) {
            revert InvalidTerms();
        }
        if (!_isLowerHexSha256(reviewSha256)) revert InvalidTerms();
        if (consequenceRuleId < CONSEQUENCE_PASS || consequenceRuleId > CONSEQUENCE_NEUTRAL) {
            revert InvalidConsequence();
        }

        if (processedMilestones[milestoneId]) {
            emit OutcomeIgnored(milestoneId, "MILESTONE_ALREADY_PROCESSED");
            return;
        }
        if (milestone.status == EscrowStatus.SETTLED || milestone.status == EscrowStatus.RECOVERED) {
            emit OutcomeIgnored(milestoneId, "MILESTONE_ALREADY_TERMINAL");
            return;
        }
        if (milestone.status != EscrowStatus.ACTIVE) {
            emit OutcomeIgnored(milestoneId, "MILESTONE_ESCROW_NOT_ACTIVE");
            return;
        }
        if (block.timestamp > milestone.recoveryDeadline) {
            emit OutcomeIgnored(milestoneId, "OUTCOME_AFTER_RECOVERY_DEADLINE");
            return;
        }

        processedMilestones[milestoneId] = true;
        uint256 principal = milestone.principalRequired;
        uint256 bond = milestone.beneficiaryBondRequired;

        if (consequenceRuleId == CONSEQUENCE_PASS) {
            claimable[milestone.beneficiary] += principal + bond;
        } else if (consequenceRuleId == CONSEQUENCE_FAIL) {
            claimable[milestone.owner] += principal + bond;
        } else {
            claimable[milestone.owner] += principal;
            claimable[milestone.beneficiary] += bond;
        }

        milestone.status = EscrowStatus.SETTLED;
        emit OutcomeApplied(milestoneId, reviewId, consequenceRuleId, reviewSha256);
    }

    function recover_unactivated(uint256 milestoneId) external {
        MilestoneEscrow storage milestone = _milestone(milestoneId);
        if (block.timestamp <= milestone.fundingDeadline) revert RecoveryNotReady();

        if (milestone.status == EscrowStatus.REGISTERED) {
            milestone.status = EscrowStatus.RECOVERED;
            emit MilestoneRecovered(milestoneId, "UNFUNDED_EXPIRED");
            return;
        }
        if (milestone.status != EscrowStatus.FUNDED) revert WrongState();

        claimable[milestone.owner] += milestone.principalRequired;
        milestone.status = EscrowStatus.RECOVERED;
        emit MilestoneRecovered(milestoneId, "BOND_NOT_POSTED");
    }

    function recover_active(uint256 milestoneId) external {
        MilestoneEscrow storage milestone = _milestone(milestoneId);
        if (milestone.status != EscrowStatus.ACTIVE) revert WrongState();
        if (block.timestamp <= milestone.recoveryDeadline) revert RecoveryNotReady();

        claimable[milestone.owner] += milestone.principalRequired;
        claimable[milestone.beneficiary] += milestone.beneficiaryBondRequired;
        milestone.status = EscrowStatus.RECOVERED;
        processedMilestones[milestoneId] = true;
        emit MilestoneRecovered(milestoneId, "RECOVERY_DEADLINE_EXPIRED");
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        claimable[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawalFailed();

        emit Withdrawal(msg.sender, amount);
    }

    fallback() external payable {
        revert InvalidTerms();
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

    function _milestone(uint256 milestoneId) internal view returns (MilestoneEscrow storage milestone) {
        milestone = milestones[milestoneId];
        if (milestone.status == EscrowStatus.NONE) revert UnknownMilestone();
    }
}
