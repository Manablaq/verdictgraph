// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VerdictGraphVault} from "../contracts/VerdictGraphVault.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function assume(bool condition) external;
}

contract ReentrantWithdrawer {
    VerdictGraphVault public immutable vault;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(VerdictGraphVault vault_) {
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

contract RejectingWithdrawer {
    VerdictGraphVault public immutable vault;

    constructor(VerdictGraphVault vault_) {
        vault = vault_;
    }

    function withdrawFromVault() external {
        vault.withdraw();
    }

    receive() external payable {
        revert("NO_NATIVE_TOKEN");
    }
}

contract VerdictGraphVaultTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    VerdictGraphVault private vault;
    address private requester = address(0xA11CE);
    address private provider = address(0xB0B);
    address private outsider = address(0xBAD);

    uint256 private constant PRINCIPAL = 1 ether;
    uint256 private constant BOND = 0.2 ether;
    string private constant POLICY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    string private constant DELIVERY = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    string private constant VERDICT = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    function setUp() public {
        vm.warp(1_800_000_000);
        vault = new VerdictGraphVault(address(this), address(this));
        _register(vault, 11, requester, provider, PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.deal(provider, 10 ether);
        _activate(vault, 11, requester, provider, PRINCIPAL, BOND);
    }

    function deployVaultForTest(address registryCore_, address adjudicatorCore_) external returns (VerdictGraphVault) {
        return new VerdictGraphVault(registryCore_, adjudicatorCore_);
    }

    function testConstructorRejectsZeroController() public {
        (bool registryOk,) = address(this).call(abi.encodeCall(this.deployVaultForTest, (address(0), address(this))));
        require(!registryOk, "zero registry core accepted");
        (bool adjudicatorOk,) = address(this).call(abi.encodeCall(this.deployVaultForTest, (address(this), address(0))));
        require(!adjudicatorOk, "zero adjudicator core accepted");
    }

    function testOnlyRegistryCoreCanRegisterHandoff() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        vm.prank(outsider);
        (bool ok,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (
                        1,
                        44,
                        POLICY,
                        requester,
                        provider,
                        PRINCIPAL,
                        BOND,
                        block.timestamp + 1 days,
                        block.timestamp + 7 days
                    )
                )
            );
        require(!ok, "non-core registration succeeded");
        require(fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.NONE), "unauthorized state written");
    }

    function testRegistryAndAdjudicatorRolesAreSeparated() public {
        address adjudicator = address(0xAD1);
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), adjudicator);

        (bool registryVerdictOk,) =
            address(fresh).call(abi.encodeCall(fresh.apply_final_verdict, (91, 1, 44, POLICY, uint256(2), VERDICT)));
        require(!registryVerdictOk, "registry applied adjudicator verdict");

        vm.prank(adjudicator);
        (bool adjudicatorCompletionOk,) =
            address(fresh).call(abi.encodeCall(fresh.apply_handoff_completion, (1, 44, POLICY, DELIVERY)));
        require(!adjudicatorCompletionOk, "adjudicator applied registry completion");
    }

    function testRegistrationRejectsMalformedPolicyDigest() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        (bool shortOk,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (
                        1,
                        44,
                        "abcd",
                        requester,
                        provider,
                        PRINCIPAL,
                        BOND,
                        block.timestamp + 1 days,
                        block.timestamp + 7 days
                    )
                )
            );
        require(!shortOk, "short policy digest accepted");

        string memory uppercase = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        (bool upperOk,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (
                        1,
                        45,
                        uppercase,
                        requester,
                        provider,
                        PRINCIPAL,
                        BOND,
                        block.timestamp + 1 days,
                        block.timestamp + 7 days
                    )
                )
            );
        require(!upperOk, "non-canonical policy digest accepted");
    }

    function testRegistrationRejectsInvalidParticipantsAndTerms() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        (bool samePartyOk,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (
                        1,
                        44,
                        POLICY,
                        requester,
                        requester,
                        PRINCIPAL,
                        BOND,
                        block.timestamp + 1 days,
                        block.timestamp + 7 days
                    )
                )
            );
        require(!samePartyOk, "same participant accepted");

        (bool zeroPrincipalOk,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (1, 45, POLICY, requester, provider, 0, BOND, block.timestamp + 1 days, block.timestamp + 7 days)
                )
            );
        require(!zeroPrincipalOk, "zero principal accepted");
    }

    function testIdenticalRegistrationIsIdempotent() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        require(
            fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.REGISTERED),
            "idempotent registration changed state"
        );
    }

    function testConflictingDuplicateRegistrationReverts() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        (bool ok,) = address(fresh)
            .call(
                abi.encodeCall(
                    fresh.register_handoff,
                    (
                        1,
                        44,
                        POLICY,
                        requester,
                        provider,
                        PRINCIPAL + 1,
                        BOND,
                        block.timestamp + 1 days,
                        block.timestamp + 7 days
                    )
                )
            );
        require(!ok, "conflicting duplicate registration accepted");
    }

    function testFundingRequiresRequesterAndExactPrincipal() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.deal(outsider, 10 ether);

        vm.prank(outsider);
        (bool wrongRequesterOk,) = address(fresh).call{value: PRINCIPAL}(abi.encodeCall(fresh.fund_handoff, (44)));
        require(!wrongRequesterOk, "outsider funded handoff");

        vm.prank(requester);
        (bool wrongAmountOk,) = address(fresh).call{value: PRINCIPAL - 1}(abi.encodeCall(fresh.fund_handoff, (44)));
        require(!wrongAmountOk, "wrong principal accepted");

        vm.prank(requester);
        fresh.fund_handoff{value: PRINCIPAL}(44);
        require(fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.FUNDED), "correct funding failed");
    }

    function testBondRequiresProviderAndExactBond() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.deal(provider, 10 ether);
        vm.deal(outsider, 10 ether);
        vm.prank(requester);
        fresh.fund_handoff{value: PRINCIPAL}(44);

        vm.prank(outsider);
        (bool wrongProviderOk,) = address(fresh).call{value: BOND}(abi.encodeCall(fresh.post_bond, (44)));
        require(!wrongProviderOk, "outsider posted bond");

        vm.prank(provider);
        (bool wrongAmountOk,) = address(fresh).call{value: BOND - 1}(abi.encodeCall(fresh.post_bond, (44)));
        require(!wrongAmountOk, "wrong bond accepted");

        vm.prank(provider);
        fresh.post_bond{value: BOND}(44);
        require(fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.ACTIVE), "correct bond failed");
    }

    function testFundingAndBondWindowCloseAfterDeadline() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.warp(block.timestamp + 2 days);
        vm.prank(requester);
        (bool ok,) = address(fresh).call{value: PRINCIPAL}(abi.encodeCall(fresh.fund_handoff, (44)));
        require(!ok, "late funding accepted");
    }

    function testExplicitCompletionReleasesPrincipalAndBondToProvider() public {
        vault.apply_handoff_completion(1, 11, POLICY, DELIVERY);
        require(vault.claimable(provider) == PRINCIPAL + BOND, "provider release mismatch");
        require(vault.handoff_status(11) == uint256(VerdictGraphVault.EscrowStatus.SETTLED), "not settled");
    }

    function testCompletionRejectsMalformedDeliveryDigest() public {
        (bool shortOk,) = address(vault).call(abi.encodeCall(vault.apply_handoff_completion, (1, 11, POLICY, "abcd")));
        require(!shortOk, "short delivery digest accepted");
        string memory uppercase = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
        (bool upperOk,) =
            address(vault).call(abi.encodeCall(vault.apply_handoff_completion, (1, 11, POLICY, uppercase)));
        require(!upperOk, "non-canonical delivery digest accepted");
        require(
            vault.handoff_status(11) == uint256(VerdictGraphVault.EscrowStatus.ACTIVE), "malformed digest changed state"
        );
    }

    function testDuplicateCompletionIsIdempotent() public {
        vault.apply_handoff_completion(1, 11, POLICY, DELIVERY);
        vault.apply_handoff_completion(1, 11, POLICY, DELIVERY);
        require(vault.claimable(provider) == PRINCIPAL + BOND, "duplicate credited twice");
    }

    function testWrongPolicyOrWorkflowCannotComplete() public {
        (bool workflowOk,) =
            address(vault).call(abi.encodeCall(vault.apply_handoff_completion, (2, 11, POLICY, DELIVERY)));
        require(!workflowOk, "wrong workflow completed escrow");
        string memory otherPolicy = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
        (bool policyOk,) =
            address(vault).call(abi.encodeCall(vault.apply_handoff_completion, (1, 11, otherPolicy, DELIVERY)));
        require(!policyOk, "wrong policy completed escrow");
        require(
            vault.handoff_status(11) == uint256(VerdictGraphVault.EscrowStatus.ACTIVE), "bad completion changed state"
        );
    }

    function testOnlyBoundControllersCanApplyCompletionOrVerdict() public {
        vm.prank(outsider);
        (bool completionOk,) =
            address(vault).call(abi.encodeCall(vault.apply_handoff_completion, (1, 11, POLICY, DELIVERY)));
        require(!completionOk, "outsider completed escrow");

        uint256 breachRule = vault.CONSEQUENCE_PROVIDER_BREACH();
        vm.prank(outsider);
        (bool verdictOk,) =
            address(vault).call(abi.encodeCall(vault.apply_final_verdict, (91, 1, 11, POLICY, breachRule, VERDICT)));
        require(!verdictOk, "outsider applied verdict");
    }

    function testReleaseProviderVerdictPaysExactPrincipalAndBond() public {
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_RELEASE_PROVIDER(), VERDICT);
        require(vault.claimable(provider) == PRINCIPAL + BOND, "provider verdict payout mismatch");
        require(vault.claimable(requester) == 0, "requester should receive nothing");
    }

    function testProviderBreachTransfersExactPrincipalAndBondToRequester() public {
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), VERDICT);
        require(vault.claimable(requester) == PRINCIPAL + BOND, "requester breach payout mismatch");
        require(vault.claimable(provider) == 0, "provider should receive nothing");
    }

    function testNeutralConsequenceReturnsPrincipalAndBondSeparately() public {
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_NEUTRAL_RECOVERY(), VERDICT);
        require(vault.claimable(requester) == PRINCIPAL, "neutral principal mismatch");
        require(vault.claimable(provider) == BOND, "neutral bond mismatch");
    }

    function testVerdictRejectsMalformedDigestAndInvalidConsequence() public {
        (bool hashOk,) = address(vault)
            .call(
                abi.encodeCall(
                    vault.apply_final_verdict, (91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), "abcd")
                )
            );
        require(!hashOk, "malformed verdict digest accepted");
        require(!vault.processedCases(91), "malformed verdict consumed case id");

        (bool consequenceOk,) =
            address(vault).call(abi.encodeCall(vault.apply_final_verdict, (91, 1, 11, POLICY, 99, VERDICT)));
        require(!consequenceOk, "invalid consequence accepted");
        require(!vault.processedCases(91), "invalid consequence consumed case id");
    }

    function testDuplicateVerdictIsIdempotent() public {
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), VERDICT);
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), VERDICT);
        require(vault.claimable(requester) == PRINCIPAL + BOND, "duplicate verdict credited twice");
    }

    function testLateVerdictCannotReopenRecoveredEscrow() public {
        vm.warp(block.timestamp + 8 days);
        vault.recover_active(11);
        uint256 requesterBefore = vault.claimable(requester);
        uint256 providerBefore = vault.claimable(provider);
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), VERDICT);
        require(
            vault.handoff_status(11) == uint256(VerdictGraphVault.EscrowStatus.RECOVERED),
            "late verdict reopened escrow"
        );
        require(vault.claimable(requester) == requesterBefore, "late verdict changed requester balance");
        require(vault.claimable(provider) == providerBefore, "late verdict changed provider balance");
    }

    function testUnactivatedUnfundedRecovery() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        vm.warp(block.timestamp + 2 days);
        fresh.recover_unactivated(44);
        require(
            fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.RECOVERED),
            "unfunded escrow not recovered"
        );
        require(fresh.claimable(requester) == 0, "unfunded escrow created refund");
    }

    function testUnactivatedFundedRecoveryReturnsPrincipal() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        _register(fresh, 44, requester, provider, PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.prank(requester);
        fresh.fund_handoff{value: PRINCIPAL}(44);
        vm.warp(block.timestamp + 2 days);
        fresh.recover_unactivated(44);
        require(fresh.claimable(requester) == PRINCIPAL, "principal not recoverable");
        require(
            fresh.handoff_status(44) == uint256(VerdictGraphVault.EscrowStatus.RECOVERED), "funded escrow not recovered"
        );
    }

    function testRecoveryCannotRunBeforeDeadline() public {
        (bool ok,) = address(vault).call(abi.encodeCall(vault.recover_active, (11)));
        require(!ok, "active escrow recovered early");
        require(
            vault.handoff_status(11) == uint256(VerdictGraphVault.EscrowStatus.ACTIVE), "early recovery changed state"
        );
    }

    function testNeutralRecoveryReturnsPrincipalAndBondSeparately() public {
        vm.warp(block.timestamp + 8 days);
        vault.recover_active(11);
        require(vault.claimable(requester) == PRINCIPAL, "principal recovery mismatch");
        require(vault.claimable(provider) == BOND, "bond recovery mismatch");
    }

    function testWithdrawPaysClaimableExactlyOnce() public {
        vault.apply_final_verdict(91, 1, 11, POLICY, vault.CONSEQUENCE_PROVIDER_BREACH(), VERDICT);
        uint256 beforeBalance = requester.balance;
        vm.prank(requester);
        vault.withdraw();
        require(requester.balance == beforeBalance + PRINCIPAL + BOND, "withdrawal amount mismatch");
        require(vault.claimable(requester) == 0, "claimable not cleared");
        vm.prank(requester);
        (bool secondOk,) = address(vault).call(abi.encodeCall(vault.withdraw, ()));
        require(!secondOk, "second withdrawal succeeded");
    }

    function testWithdrawReentrancyCannotDoubleSpend() public {
        ReentrantWithdrawer receiver = new ReentrantWithdrawer(vault);
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        receiver = new ReentrantWithdrawer(fresh);
        _register(fresh, 44, requester, address(receiver), PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.deal(address(receiver), 10 ether);
        vm.prank(requester);
        fresh.fund_handoff{value: PRINCIPAL}(44);
        vm.prank(address(receiver));
        fresh.post_bond{value: BOND}(44);
        fresh.apply_handoff_completion(1, 44, POLICY, DELIVERY);

        uint256 beforeBalance = address(receiver).balance;
        receiver.withdrawFromVault();
        require(receiver.reentryAttempted(), "reentry was not attempted");
        require(!receiver.reentrySucceeded(), "reentrant withdrawal succeeded");
        require(address(receiver).balance == beforeBalance + PRINCIPAL + BOND, "receiver payout mismatch");
        require(fresh.claimable(address(receiver)) == 0, "claimable remained after withdrawal");
    }

    function testWithdrawalFailureRestoresClaimableBalance() public {
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        RejectingWithdrawer receiver = new RejectingWithdrawer(fresh);
        _register(fresh, 44, requester, address(receiver), PRINCIPAL, BOND);
        vm.deal(requester, 10 ether);
        vm.deal(address(receiver), 10 ether);
        vm.prank(requester);
        fresh.fund_handoff{value: PRINCIPAL}(44);
        vm.prank(address(receiver));
        fresh.post_bond{value: BOND}(44);
        fresh.apply_handoff_completion(1, 44, POLICY, DELIVERY);

        (bool ok,) = address(receiver).call(abi.encodeCall(receiver.withdrawFromVault, ()));
        require(!ok, "rejecting receiver withdrawal succeeded");
        require(fresh.claimable(address(receiver)) == PRINCIPAL + BOND, "failed withdrawal lost claimable balance");
    }

    function testDirectNativeTransfersAreRejected() public {
        vm.deal(address(this), 1 ether);
        (bool receiveOk,) = address(vault).call{value: 1 wei}("");
        require(!receiveOk, "direct receive accepted");
        (bool fallbackOk,) = address(vault).call{value: 1 wei}(hex"1234");
        require(!fallbackOk, "direct fallback accepted");
    }

    function testFuzzExactProviderRelease(uint128 principal, uint128 bond) public {
        vm.assume(principal > 0 && bond > 0);
        VerdictGraphVault fresh = new VerdictGraphVault(address(this), address(this));
        address fuzzRequester = address(0xCAFE);
        address fuzzProvider = address(0xBEEF);
        _register(fresh, 77, fuzzRequester, fuzzProvider, uint256(principal), uint256(bond));
        vm.deal(fuzzRequester, uint256(principal));
        vm.deal(fuzzProvider, uint256(bond));
        vm.prank(fuzzRequester);
        fresh.fund_handoff{value: uint256(principal)}(77);
        vm.prank(fuzzProvider);
        fresh.post_bond{value: uint256(bond)}(77);
        fresh.apply_handoff_completion(1, 77, POLICY, DELIVERY);
        require(fresh.claimable(fuzzProvider) == uint256(principal) + uint256(bond), "fuzz release mismatch");
    }

    function _register(
        VerdictGraphVault target,
        uint256 handoffId,
        address requester_,
        address provider_,
        uint256 principal_,
        uint256 bond_
    ) internal {
        target.register_handoff(
            1,
            handoffId,
            POLICY,
            requester_,
            provider_,
            principal_,
            bond_,
            block.timestamp + 1 days,
            block.timestamp + 7 days
        );
    }

    function _activate(
        VerdictGraphVault target,
        uint256 handoffId,
        address requester_,
        address provider_,
        uint256 principal_,
        uint256 bond_
    ) internal {
        vm.prank(requester_);
        target.fund_handoff{value: principal_}(handoffId);
        vm.prank(provider_);
        target.post_bond{value: bond_}(handoffId);
    }
}
