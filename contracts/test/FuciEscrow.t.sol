// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FuciEscrow} from "../FuciEscrow.sol";
import {MockUSDC, FeeOnTransferToken, ReentrantToken, IEscrowLike} from "./Mocks.sol";

contract FuciEscrowTest is Test {
    FuciEscrow escrow;
    MockUSDC usdc;

    address owner = address(this);
    address treasury = makeAddr("treasury");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address evaluator = makeAddr("evaluator");
    address stranger = makeAddr("stranger");

    uint256 constant AMOUNT = 100e6; // 100 USDC
    uint16 constant FEE = 100; // 1%
    uint32 constant REVIEW = 1 days;
    bytes32 constant TERMS = keccak256("terms");
    bytes32 constant WORK = keccak256("work");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        escrow = new FuciEscrow(address(usdc), treasury, FEE, 1_000e6, 10_000e6);
        usdc.mint(client, 10_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _create(address eval) internal returns (uint256) {
        vm.prank(client);
        return escrow.createJob(provider, eval, AMOUNT, uint64(block.timestamp + 7 days), REVIEW, TERMS, "https://fuci.family/jobs/1", FEE);
    }

    function _submit(uint256 id) internal {
        vm.prank(provider);
        escrow.submit(id, WORK, "https://fuci.family/jobs/1/work");
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_rejectsBadArgs() public {
        vm.expectRevert(FuciEscrow.ZeroAddress.selector);
        new FuciEscrow(address(0), treasury, FEE, 1_000e6, 10_000e6);
        vm.expectRevert(FuciEscrow.NotAContract.selector);
        new FuciEscrow(makeAddr("eoa"), treasury, FEE, 1_000e6, 10_000e6);
        vm.expectRevert(FuciEscrow.ZeroAddress.selector);
        new FuciEscrow(address(usdc), address(0), FEE, 1_000e6, 10_000e6);
        vm.expectRevert(FuciEscrow.FeeTooHigh.selector);
        new FuciEscrow(address(usdc), treasury, 501, 1_000e6, 10_000e6);
        vm.expectRevert(FuciEscrow.BadLimits.selector);
        new FuciEscrow(address(usdc), treasury, FEE, 1_000e6, 999e6);
        vm.expectRevert(FuciEscrow.BadLimits.selector);
        new FuciEscrow(address(usdc), treasury, FEE, 1_000_001e6, 2_000_000e6);
    }

    // ------------------------------------------------------------------ create

    function test_create_locksFunds() public {
        uint256 id = _create(evaluator);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(escrow.totalLocked(), AMOUNT);
        FuciEscrow.Job memory j = escrow.getJob(id);
        assertEq(j.client, client);
        assertEq(j.provider, provider);
        assertEq(j.evaluator, evaluator);
        assertEq(j.amount, AMOUNT);
        assertEq(j.feeBps, FEE);
        assertEq(uint8(j.status), uint8(FuciEscrow.Status.Funded));
        assertEq(j.termsHash, TERMS);
    }

    function test_create_defaultEvaluatorIsClient() public {
        uint256 id = _create(address(0));
        assertEq(escrow.getJob(id).evaluator, client);
    }

    function test_create_rejectsBadParties() public {
        vm.startPrank(client);
        uint64 d = uint64(block.timestamp + 1 days);
        vm.expectRevert(FuciEscrow.BadParty.selector);
        escrow.createJob(address(0), evaluator, AMOUNT, d, REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadParty.selector);
        escrow.createJob(client, evaluator, AMOUNT, d, REVIEW, TERMS, "", FEE); // provider = client
        vm.expectRevert(FuciEscrow.BadParty.selector);
        escrow.createJob(provider, provider, AMOUNT, d, REVIEW, TERMS, "", FEE); // evaluator = provider
        vm.expectRevert(FuciEscrow.BadParty.selector);
        escrow.createJob(address(escrow), evaluator, AMOUNT, d, REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadParty.selector);
        escrow.createJob(provider, address(escrow), AMOUNT, d, REVIEW, TERMS, "", FEE);
        vm.stopPrank();
    }

    function test_create_rejectsBadAmountsAndCaps() public {
        vm.startPrank(client);
        uint64 d = uint64(block.timestamp + 1 days);
        vm.expectRevert(FuciEscrow.BadAmount.selector);
        escrow.createJob(provider, evaluator, 9_999, d, REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadAmount.selector);
        escrow.createJob(provider, evaluator, 1_000e6 + 1, d, REVIEW, TERMS, "", FEE);
        vm.stopPrank();
        escrow.setLimits(1_000e6, 1_500e6);
        vm.startPrank(client);
        escrow.createJob(provider, evaluator, 1_000e6, d, REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.OverCap.selector);
        escrow.createJob(provider, evaluator, 500e6 + 1, d, REVIEW, TERMS, "", FEE);
        escrow.createJob(provider, evaluator, 500e6, d, REVIEW, TERMS, "", FEE); // exactly at the cap
        vm.stopPrank();
        assertEq(escrow.totalLocked(), 1_500e6);
    }

    function test_create_rejectsBadTimes() public {
        vm.startPrank(client);
        vm.expectRevert(FuciEscrow.BadDeadline.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp), REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadDeadline.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 180 days + 1), REVIEW, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadReview.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), 1 hours - 1, TERMS, "", FEE);
        vm.expectRevert(FuciEscrow.BadReview.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), 30 days + 1, TERMS, "", FEE);
        vm.stopPrank();
    }

    function test_create_rejectsLongURI() public {
        bytes memory long = new bytes(513);
        vm.prank(client);
        vm.expectRevert(FuciEscrow.BadURI.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, string(long), FEE);
    }

    function test_create_feeAboveClientMax() public {
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(FuciEscrow.FeeAboveMax.selector, FEE, uint16(50)));
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", 50);
    }

    function test_create_pausedBlocksNewJobs() public {
        escrow.setPaused(true);
        vm.prank(client);
        vm.expectRevert(FuciEscrow.IsPaused.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", FEE);
    }

    function test_create_withoutApprovalFails() public {
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.TransferFailed.selector);
        escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", FEE);
        assertEq(escrow.totalLocked(), 0);
        assertEq(escrow.jobCount(), 0);
    }

    function test_create_refusesShortDeposit() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        FuciEscrow e = new FuciEscrow(address(fot), treasury, FEE, 1_000e6, 10_000e6);
        fot.mint(client, 1_000e6);
        vm.startPrank(client);
        fot.approve(address(e), type(uint256).max);
        vm.expectRevert(FuciEscrow.ShortDeposit.selector);
        e.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", FEE);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ submit / extend

    function test_submit_onlyProviderBeforeDeadline() public {
        uint256 id = _create(evaluator);
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.submit(id, WORK, "");
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.BadDeliverable.selector);
        escrow.submit(id, bytes32(0), "");
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.TooLate.selector);
        escrow.submit(id, WORK, "");
    }

    function test_submit_setsReviewDeadline() public {
        uint256 id = _create(evaluator);
        _submit(id);
        FuciEscrow.Job memory j = escrow.getJob(id);
        assertEq(uint8(j.status), uint8(FuciEscrow.Status.Submitted));
        assertEq(j.reviewDeadline, block.timestamp + REVIEW);
        assertEq(j.deliverable, WORK);
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.submit(id, WORK, ""); // only once
    }

    function test_submit_worksWhilePaused() public {
        uint256 id = _create(evaluator);
        escrow.setPaused(true);
        _submit(id);
    }

    function test_extendDeadline() public {
        uint256 id = _create(evaluator);
        uint64 d = escrow.getJob(id).deadline;
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.extendDeadline(id, d + 1);
        vm.startPrank(client);
        vm.expectRevert(FuciEscrow.BadDeadline.selector);
        escrow.extendDeadline(id, d);
        vm.expectRevert(FuciEscrow.BadDeadline.selector);
        escrow.extendDeadline(id, uint64(block.timestamp + 180 days + 1));
        escrow.extendDeadline(id, d + 1 days);
        vm.stopPrank();
        assertEq(escrow.getJob(id).deadline, d + 1 days);
        _submit(id);
        vm.prank(client);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.extendDeadline(id, d + 2 days);
    }

    // ------------------------------------------------------------------ release

    function test_release_byClientPaysProviderMinusFee() public {
        uint256 id = _create(evaluator);
        _submit(id);
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), 99e6);
        assertEq(usdc.balanceOf(treasury), 1e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalLocked(), 0);
        assertEq(uint8(escrow.getJob(id).status), uint8(FuciEscrow.Status.Released));
    }

    function test_release_byEvaluator_evenBeforeSubmit() public {
        uint256 id = _create(evaluator);
        vm.prank(evaluator);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), 99e6);
    }

    function test_release_notByProviderOrStranger() public {
        uint256 id = _create(evaluator);
        _submit(id);
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.release(id);
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.release(id);
        vm.prank(owner);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.release(id);
    }

    function test_release_onlyOnce() public {
        uint256 id = _create(evaluator);
        vm.prank(client);
        escrow.release(id);
        vm.prank(client);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.release(id);
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.cancel(id);
    }

    function test_release_feeFixedAtCreation() public {
        uint256 id = _create(evaluator);
        escrow.setFee(500);
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), 99e6); // still 1%
    }

    function test_release_zeroFee() public {
        escrow.setFee(0);
        vm.prank(client);
        uint256 id = escrow.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", 0);
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider), AMOUNT);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_unknownJobCannotSettle() public {
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.release(42);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.claimTimeout(42);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.refundExpired(42);
    }

    // ------------------------------------------------------------------ reject / cancel

    function test_reject_refundsClientInWindow() public {
        uint256 id = _create(evaluator);
        uint256 before = usdc.balanceOf(client);
        _submit(id);
        vm.prank(client); // client is not the evaluator here
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.reject(id);
        vm.prank(evaluator);
        escrow.reject(id);
        assertEq(usdc.balanceOf(client), before + AMOUNT);
        assertEq(usdc.balanceOf(treasury), 0); // no fee on refunds
        assertEq(uint8(escrow.getJob(id).status), uint8(FuciEscrow.Status.Refunded));
    }

    function test_reject_notBeforeSubmitNorAfterWindow() public {
        uint256 id = _create(evaluator);
        vm.prank(evaluator);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.reject(id);
        _submit(id);
        vm.warp(block.timestamp + REVIEW + 1);
        vm.prank(evaluator);
        vm.expectRevert(FuciEscrow.TooLate.selector);
        escrow.reject(id);
    }

    function test_cancel_byProviderAnytimeBeforeSettle() public {
        uint256 id = _create(evaluator);
        uint256 before = usdc.balanceOf(client);
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.cancel(id);
        vm.prank(client);
        vm.expectRevert(FuciEscrow.NotAllowed.selector);
        escrow.cancel(id); // the client can't pull money back from a working provider
        _submit(id);
        vm.prank(provider);
        escrow.cancel(id);
        assertEq(usdc.balanceOf(client), before + AMOUNT);
    }

    // ------------------------------------------------------------------ timeouts

    function test_refundExpired() public {
        uint256 id = _create(evaluator);
        uint256 before = usdc.balanceOf(client);
        vm.warp(block.timestamp + 7 days);
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.TooEarly.selector);
        escrow.refundExpired(id);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        escrow.refundExpired(id);
        assertEq(usdc.balanceOf(client), before + AMOUNT);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_refundExpired_notAfterSubmit() public {
        uint256 id = _create(evaluator);
        _submit(id);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.refundExpired(id);
    }

    function test_claimTimeout_paysProvider() public {
        uint256 id = _create(evaluator);
        _submit(id);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(stranger);
        vm.expectRevert(FuciEscrow.TooEarly.selector);
        escrow.claimTimeout(id);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        escrow.claimTimeout(id);
        assertEq(usdc.balanceOf(provider), 99e6);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_claimTimeout_notBeforeSubmit() public {
        uint256 id = _create(evaluator);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.claimTimeout(id);
    }

    function test_exitsWorkWhilePaused() public {
        uint256 a = _create(evaluator);
        uint256 b = _create(evaluator);
        uint256 c = _create(evaluator);
        uint256 d = _create(evaluator);
        _submit(b);
        _submit(c);
        escrow.setPaused(true);
        vm.prank(client);
        escrow.release(a);
        vm.prank(evaluator);
        escrow.reject(b);
        vm.warp(block.timestamp + 8 days);
        escrow.claimTimeout(c);
        escrow.refundExpired(d);
        assertEq(escrow.totalLocked(), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ------------------------------------------------------------------ owner powers are limited

    function test_ownerOnly() public {
        vm.startPrank(stranger);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.setFee(0);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.setTreasury(stranger);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.setLimits(1e6, 1e6);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.setPaused(true);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.transferOwnership(stranger);
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.recoverERC20(address(usdc), 1);
        vm.stopPrank();
    }

    function test_ownerSettersValidate() public {
        vm.expectRevert(FuciEscrow.FeeTooHigh.selector);
        escrow.setFee(501);
        vm.expectRevert(FuciEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
        vm.expectRevert(FuciEscrow.BadTreasury.selector);
        escrow.setTreasury(address(escrow));
        vm.expectRevert(FuciEscrow.BadLimits.selector);
        escrow.setLimits(9_999, 1e6);
    }

    function test_setTreasury_redirectsFutureFees() public {
        address t2 = makeAddr("treasury2");
        escrow.setTreasury(t2);
        uint256 id = _create(evaluator);
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(t2), 1e6);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_constructor_treasuryCannotBeItself() public {
        address next = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(FuciEscrow.BadTreasury.selector);
        new FuciEscrow(address(usdc), next, FEE, 1_000e6, 10_000e6);
    }

    function test_transferOwnership_rejectsZero() public {
        vm.expectRevert(FuciEscrow.ZeroAddress.selector);
        escrow.transferOwnership(address(0));
    }

    function test_submit_rejectsLongURI() public {
        uint256 id = _create(evaluator);
        bytes memory long = new bytes(513);
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.BadURI.selector);
        escrow.submit(id, WORK, string(long));
    }

    function test_recover_cannotTouchLockedUSDC() public {
        _create(evaluator);
        vm.expectRevert(FuciEscrow.ExceedsSurplus.selector);
        escrow.recoverERC20(address(usdc), 1);
        usdc.mint(address(escrow), 5e6); // sent by mistake
        vm.expectRevert(FuciEscrow.ExceedsSurplus.selector);
        escrow.recoverERC20(address(usdc), 5e6 + 1);
        escrow.recoverERC20(address(usdc), 5e6);
        assertEq(usdc.balanceOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
    }

    function test_recover_otherTokenGoesToTreasury() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(escrow), 7);
        escrow.recoverERC20(address(other), 7);
        assertEq(other.balanceOf(treasury), 7);
    }

    function test_recover_rejectsNonContract() public {
        vm.expectRevert(FuciEscrow.TransferFailed.selector);
        escrow.recoverERC20(makeAddr("eoa"), 1);
    }

    function test_twoStepOwnership() public {
        escrow.transferOwnership(stranger);
        assertEq(escrow.owner(), owner);
        vm.prank(evaluator);
        vm.expectRevert(FuciEscrow.NotPendingOwner.selector);
        escrow.acceptOwnership();
        vm.prank(stranger);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), stranger);
        assertEq(escrow.pendingOwner(), address(0));
        vm.expectRevert(FuciEscrow.NotOwner.selector);
        escrow.setPaused(true);
    }

    // ------------------------------------------------------------------ hostile tokens and blacklists

    function test_reentrancyDuringPayoutIsBlocked() public {
        ReentrantToken rt = new ReentrantToken();
        FuciEscrow e = new FuciEscrow(address(rt), treasury, FEE, 1_000e6, 10_000e6);
        rt.mint(client, 1_000e6);
        vm.startPrank(client);
        rt.approve(address(e), type(uint256).max);
        uint256 a = e.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", FEE);
        uint256 b = e.createJob(provider, evaluator, AMOUNT, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", FEE);
        vm.stopPrank();
        rt.arm(IEscrowLike(address(e)), b);
        vm.prank(client);
        e.release(a); // the nested release hit the guard, so that transfer failed and was held instead
        assertEq(uint8(e.getJob(a).status), uint8(FuciEscrow.Status.Released));
        assertEq(uint8(e.getJob(b).status), uint8(FuciEscrow.Status.Funded)); // job b was not touched
        assertEq(e.totalLocked(), AMOUNT);
        assertEq(rt.balanceOf(address(e)), e.totalLocked() + e.totalOwed());
    }

    function test_blacklistedProviderCanStillBeRefunded() public {
        uint256 id = _create(evaluator);
        _submit(id);
        usdc.setBlacklisted(provider, true);
        vm.prank(evaluator);
        escrow.reject(id); // the money is not stuck
        assertEq(escrow.totalLocked(), 0);
        assertEq(usdc.balanceOf(client), 10_000e6);
    }

    function test_releaseToBlockedProviderIsHeldForThem() public {
        uint256 id = _create(evaluator);
        _submit(id);
        usdc.setBlacklisted(provider, true);
        vm.prank(client);
        escrow.release(id);
        assertEq(escrow.totalLocked(), 0);
        assertEq(escrow.owed(provider), AMOUNT - (AMOUNT * FEE) / 10_000);
        assertEq(usdc.balanceOf(address(escrow)), escrow.totalOwed());
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_payoutConservesFunds(uint256 amount, uint16 fee) public {
        amount = bound(amount, escrow.MIN_AMOUNT(), 1_000e6);
        fee = uint16(bound(fee, 0, 500));
        escrow.setFee(fee);
        vm.prank(client);
        uint256 id = escrow.createJob(provider, evaluator, amount, uint64(block.timestamp + 1 days), REVIEW, TERMS, "", fee);
        vm.prank(client);
        escrow.release(id);
        assertEq(usdc.balanceOf(provider) + usdc.balanceOf(treasury), amount);
        assertEq(usdc.balanceOf(treasury), (amount * fee) / 10_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_strangerCannotMoveFunds(address who, uint8 action) public {
        vm.assume(who != client && who != provider && who != evaluator && who != address(0));
        uint256 id = _create(evaluator);
        _submit(id);
        vm.startPrank(who);
        if (action % 3 == 0) {
            vm.expectRevert(FuciEscrow.NotAllowed.selector);
            escrow.release(id);
        } else if (action % 3 == 1) {
            vm.expectRevert(FuciEscrow.NotAllowed.selector);
            escrow.reject(id);
        } else {
            vm.expectRevert(FuciEscrow.NotAllowed.selector);
            escrow.cancel(id);
        }
        vm.stopPrank();
        assertEq(escrow.totalLocked(), AMOUNT);
    }
}
