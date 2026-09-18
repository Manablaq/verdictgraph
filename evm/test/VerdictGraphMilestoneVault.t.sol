// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VerdictGraphMilestoneVault} from "../contracts/VerdictGraphMilestoneVault.sol";

interface Vm {
    function warp(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function assume(bool) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract ReentrantMilestoneWithdrawer {
    VerdictGraphMilestoneVault public immutable vault;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(VerdictGraphMilestoneVault vault_) {
        vault = vault_;
    }

    function withdrawFromVault() external {
        vault.withdraw();
    }

    receive() external payable {
        if (!reentryAttempted) {
            reentryAttempted = true;
            try vault.withdraw() {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

contract RejectingMilestoneWithdrawer {
    VerdictGraphMilestoneVault public immutable vault;

    constructor(VerdictGraphMilestoneVault vault_) {
        vault = vault_;
    }

    function withdrawFromVault() external {
        vault.withdraw();
    }

    receive() external payable {
        revert("NO_NATIVE_TOKEN");
    }
}

contract VerdictGraphMilestoneVaultTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    VerdictGraphMilestoneVault private vault;
    address private constant OWNER = address(0x1001);
    address private constant BENEFICIARY = address(0x1002);
    uint256 private constant PRINCIPAL = 10 ether;
    uint256 private constant BOND = 2 ether;
    string private constant TERMS = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    string private constant REVIEW = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    function setUp() public {
        vault = new VerdictGraphMilestoneVault(address(this));
    }

    function _register(uint256 milestoneId) private {
        vault.register_milestone(
            milestoneId,
            OWNER,
            BENEFICIARY,
            PRINCIPAL,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
    }

    function _activate(uint256 milestoneId) private {
        _register(milestoneId);
        vm.deal(OWNER, PRINCIPAL);
        vm.prank(OWNER);
        vault.fund_milestone{value: PRINCIPAL}(milestoneId);
        vm.deal(BENEFICIARY, BOND);
        vm.prank(BENEFICIARY);
        vault.post_bond{value: BOND}(milestoneId);
    }

    function testControllerIsImmutableAndRegistrationIsIdempotent() public {
        require(vault.milestone_core() == address(this), "controller mismatch");
        _register(1);
        vault.register_milestone(
            1,
            OWNER,
            BENEFICIARY,
            PRINCIPAL,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
        require(vault.milestone_status(1) == 1, "registration status mismatch");

        vm.expectRevert(VerdictGraphMilestoneVault.AlreadyRegistered.selector);
        vault.register_milestone(
            1,
            OWNER,
            BENEFICIARY,
            PRINCIPAL + 1,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
    }

    function testOnlyControllerCanRegisterAndApplyOutcome() public {
        MilestoneCaller caller = new MilestoneCaller();
        (bool registrationOk,) = address(caller).call(
            abi.encodeCall(
                caller.register,
                (vault, 1, OWNER, BENEFICIARY, PRINCIPAL, BOND, block.timestamp + 1 days, block.timestamp + 7 days, TERMS)
            )
        );
        require(!registrationOk, "non-controller registration unexpectedly succeeded");

        _register(1);
        (bool outcomeOk,) = address(caller).call(
            abi.encodeCall(
                caller.applyOutcome,
                (vault, 1, 1, TERMS, vault.CONSEQUENCE_PASS(), REVIEW)
            )
        );
        require(!outcomeOk, "non-controller outcome unexpectedly succeeded");
    }

    function testPassPaysBeneficiaryExactPrincipalAndBondOnce() public {
        _activate(1);
        vault.apply_final_outcome(1, 7, TERMS, vault.CONSEQUENCE_PASS(), REVIEW);
        require(vault.claimable(BENEFICIARY) == PRINCIPAL + BOND, "pass payout mismatch");
        require(vault.claimable(OWNER) == 0, "owner unexpectedly paid");
        require(vault.milestone_status(1) == 4, "pass status mismatch");

        // Duplicate finality delivery is safely ignored and cannot double-pay.
        vault.apply_final_outcome(1, 8, TERMS, vault.CONSEQUENCE_FAIL(), REVIEW);
        require(vault.claimable(BENEFICIARY) == PRINCIPAL + BOND, "duplicate changed payout");
    }

    function testBreachOutcomeReturnsExactPrincipalAndBondToOwner() public {
        _activate(2);
        vault.apply_final_outcome(2, 9, TERMS, vault.CONSEQUENCE_FAIL(), REVIEW);
        require(vault.claimable(OWNER) == PRINCIPAL + BOND, "fail payout mismatch");
        require(vault.claimable(BENEFICIARY) == 0, "beneficiary unexpectedly paid");
    }

    function testNeutralOutcomeSplitsPrincipalAndBond() public {
        _activate(3);
        vault.apply_final_outcome(3, 10, TERMS, vault.CONSEQUENCE_NEUTRAL(), REVIEW);
        require(vault.claimable(OWNER) == PRINCIPAL, "neutral principal mismatch");
        require(vault.claimable(BENEFICIARY) == BOND, "neutral bond mismatch");
    }

    function testPrematureOutcomeDoesNotConsumeActiveEscrow() public {
        _register(4);
        vault.apply_final_outcome(4, 1, TERMS, vault.CONSEQUENCE_PASS(), REVIEW);
        require(!vault.processedMilestones(4), "premature outcome consumed milestone");
        require(vault.milestone_status(4) == 1, "premature outcome changed status");
        _activateExisting(4);
        vault.apply_final_outcome(4, 1, TERMS, vault.CONSEQUENCE_PASS(), REVIEW);
        require(vault.claimable(BENEFICIARY) == PRINCIPAL + BOND, "retry payout mismatch");
    }

    function _activateExisting(uint256 milestoneId) private {
        vm.deal(OWNER, PRINCIPAL);
        vm.prank(OWNER);
        vault.fund_milestone{value: PRINCIPAL}(milestoneId);
        vm.deal(BENEFICIARY, BOND);
        vm.prank(BENEFICIARY);
        vault.post_bond{value: BOND}(milestoneId);
    }

    function testActiveRecoveryReturnsFundsAndBecomesTerminal() public {
        _activate(5);
        vm.warp(block.timestamp + 8 days);
        vault.recover_active(5);
        require(vault.milestone_status(5) == 5, "recovery status mismatch");
        require(vault.claimable(OWNER) == PRINCIPAL, "recovery principal mismatch");
        require(vault.claimable(BENEFICIARY) == BOND, "recovery bond mismatch");
        require(vault.processedMilestones(5), "recovery not consumed");
    }

    function testOutcomeAfterRecoveryDeadlineCannotSettle() public {
        _activate(10);
        vm.warp(block.timestamp + 8 days);

        vault.apply_final_outcome(10, 12, TERMS, vault.CONSEQUENCE_PASS(), REVIEW);
        require(!vault.processedMilestones(10), "late outcome consumed milestone");
        require(vault.milestone_status(10) == 3, "late outcome changed active state");

        vault.recover_active(10);
        require(vault.milestone_status(10) == 5, "late outcome blocked recovery");
        require(vault.claimable(OWNER) == PRINCIPAL, "late outcome recovery principal mismatch");
        require(vault.claimable(BENEFICIARY) == BOND, "late outcome recovery bond mismatch");
    }

    function testUnactivatedRegisteredRecoveryReturnsEmptyEscrow() public {
        _register(8);
        vm.expectRevert(VerdictGraphMilestoneVault.RecoveryNotReady.selector);
        vault.recover_unactivated(8);

        vm.warp(block.timestamp + 2 days);
        vault.recover_unactivated(8);
        require(vault.milestone_status(8) == 5, "registered recovery status mismatch");
        require(vault.claimable(OWNER) == 0, "empty escrow created a claim");
    }

    function testUnactivatedFundedRecoveryReturnsPrincipal() public {
        _register(9);
        vm.deal(OWNER, PRINCIPAL);
        vm.prank(OWNER);
        vault.fund_milestone{value: PRINCIPAL}(9);

        vm.warp(block.timestamp + 2 days);
        vault.recover_unactivated(9);
        require(vault.milestone_status(9) == 5, "funded recovery status mismatch");
        require(vault.claimable(OWNER) == PRINCIPAL, "funded recovery principal mismatch");
    }

    function testMalformedHashesAndDirectTransfersAreRejected() public {
        vm.expectRevert(VerdictGraphMilestoneVault.InvalidTerms.selector);
        vault.register_milestone(
            6,
            OWNER,
            BENEFICIARY,
            PRINCIPAL,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        );

        vm.deal(address(this), 1 wei);
        (bool ok,) = address(vault).call{value: 1 wei}("");
        require(!ok, "direct native transfer unexpectedly accepted");
    }

    function testWithdrawUsesPullBalance() public {
        _activate(7);
        vault.apply_final_outcome(7, 11, TERMS, vault.CONSEQUENCE_PASS(), REVIEW);
        uint256 beforeBalance = BENEFICIARY.balance;
        vm.prank(BENEFICIARY);
        vault.withdraw();
        require(BENEFICIARY.balance == beforeBalance + PRINCIPAL + BOND, "withdrawal mismatch");
        require(vault.claimable(BENEFICIARY) == 0, "claimable not cleared");
    }

    function testWithdrawReentrancyCannotDoubleSpend() public {
        VerdictGraphMilestoneVault fresh = new VerdictGraphMilestoneVault(address(this));
        ReentrantMilestoneWithdrawer receiver = new ReentrantMilestoneWithdrawer(fresh);
        fresh.register_milestone(
            11,
            OWNER,
            address(receiver),
            PRINCIPAL,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
        vm.deal(OWNER, PRINCIPAL);
        vm.prank(OWNER);
        fresh.fund_milestone{value: PRINCIPAL}(11);
        vm.deal(address(receiver), BOND);
        vm.prank(address(receiver));
        fresh.post_bond{value: BOND}(11);
        fresh.apply_final_outcome(11, 13, TERMS, fresh.CONSEQUENCE_PASS(), REVIEW);

        uint256 beforeBalance = address(receiver).balance;
        receiver.withdrawFromVault();
        require(receiver.reentryAttempted(), "reentry was not attempted");
        require(!receiver.reentrySucceeded(), "reentrant withdrawal succeeded");
        require(address(receiver).balance == beforeBalance + PRINCIPAL + BOND, "reentrant payout mismatch");
        require(fresh.claimable(address(receiver)) == 0, "reentrant claimable remained");
    }

    function testWithdrawalFailureRestoresClaimableBalance() public {
        VerdictGraphMilestoneVault fresh = new VerdictGraphMilestoneVault(address(this));
        RejectingMilestoneWithdrawer receiver = new RejectingMilestoneWithdrawer(fresh);
        fresh.register_milestone(
            12,
            OWNER,
            address(receiver),
            PRINCIPAL,
            BOND,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
        vm.deal(OWNER, PRINCIPAL);
        vm.prank(OWNER);
        fresh.fund_milestone{value: PRINCIPAL}(12);
        vm.deal(address(receiver), BOND);
        vm.prank(address(receiver));
        fresh.post_bond{value: BOND}(12);
        fresh.apply_final_outcome(12, 14, TERMS, fresh.CONSEQUENCE_PASS(), REVIEW);

        (bool ok,) = address(receiver).call(abi.encodeCall(receiver.withdrawFromVault, ()));
        require(!ok, "rejecting receiver withdrawal succeeded");
        require(fresh.claimable(address(receiver)) == PRINCIPAL + BOND, "failed withdrawal lost claimable");
    }

    function testPayoutOverflowIsRejectedAtRegistration() public {
        vm.expectRevert(VerdictGraphMilestoneVault.PayoutOverflow.selector);
        vault.register_milestone(
            13,
            OWNER,
            BENEFICIARY,
            type(uint256).max,
            1,
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
    }

    function testFuzzPassPayoutIsExact(uint128 principal, uint128 bond) public {
        vm.assume(principal > 0 && bond > 0);
        VerdictGraphMilestoneVault fresh = new VerdictGraphMilestoneVault(address(this));
        fresh.register_milestone(
            14,
            OWNER,
            BENEFICIARY,
            uint256(principal),
            uint256(bond),
            block.timestamp + 1 days,
            block.timestamp + 7 days,
            TERMS
        );
        vm.deal(OWNER, uint256(principal));
        vm.prank(OWNER);
        fresh.fund_milestone{value: uint256(principal)}(14);
        vm.deal(BENEFICIARY, uint256(bond));
        vm.prank(BENEFICIARY);
        fresh.post_bond{value: uint256(bond)}(14);
        fresh.apply_final_outcome(14, 15, TERMS, fresh.CONSEQUENCE_PASS(), REVIEW);
        require(fresh.claimable(BENEFICIARY) == uint256(principal) + uint256(bond), "fuzz payout mismatch");
    }
}

contract MilestoneCaller {
    function register(
        VerdictGraphMilestoneVault vault,
        uint256 milestoneId,
        address owner,
        address beneficiary,
        uint256 principal,
        uint256 bond,
        uint256 fundingDeadline,
        uint256 recoveryDeadline,
        string calldata terms
    ) external {
        vault.register_milestone(
            milestoneId,
            owner,
            beneficiary,
            principal,
            bond,
            fundingDeadline,
            recoveryDeadline,
            terms
        );
    }

    function applyOutcome(
        VerdictGraphMilestoneVault vault,
        uint256 milestoneId,
        uint256 reviewId,
        string calldata terms,
        uint256 consequence,
        string calldata review
    ) external {
        vault.apply_final_outcome(milestoneId, reviewId, terms, consequence, review);
    }
}
