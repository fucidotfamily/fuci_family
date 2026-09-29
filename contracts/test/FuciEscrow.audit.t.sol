// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FuciEscrow} from "../FuciEscrow.sol";
import {MockUSDC} from "./Mocks.sol";

/// USDC that can also be paused, like Circle's USDC on Arc (which also has a blocklist).
contract PausableUSDC is MockUSDC {
    bool public paused;

    function setPaused(bool p) external {
        paused = p;
    }

    function _move(address from, address to, uint256 amount) internal override {
        require(!paused, "paused");
        super._move(from, to, amount);
    }
}

/// Audit findings (2026-09-29): a blocked party or a USDC pause used to leave jobs stuck or flip a dispute.
/// These tests are the proofs of concept, now asserting the fixed behaviour.
contract FuciEscrowAuditTest is Test {
    PausableUSDC usdc;
    FuciEscrow escrow;
    address treasury = makeAddr("treasury");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address evaluator = makeAddr("evaluator");
    uint256 constant AMOUNT = 100e6;
    uint32 constant REVIEW = 1 days;

    function setUp() public {
        usdc = new PausableUSDC();
        escrow = new FuciEscrow(address(usdc), treasury, 100, 1_000e6, 10_000e6);
        usdc.mint(client, 1_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _job(address eval) internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createJob(provider, eval, AMOUNT, uint64(block.timestamp + 3 days), REVIEW, bytes32("terms"), "", 100);
    }

    function _solvent() internal view {
        assertEq(usdc.balanceOf(address(escrow)), escrow.totalLocked() + escrow.totalOwed());
    }

    /// Finding 1: a provider blocked after the review window. Before: stuck forever. Now: the job settles,
    /// the payout is held for the provider only, and paid when the block is lifted.
    function test_blockedProviderAfterReview_settlesAndHolds() public {
        uint256 id = _job(evaluator);
        vm.prank(provider);
        escrow.submit(id, bytes32("work"), "");
        usdc.setBlacklisted(provider, true);
        vm.warp(block.timestamp + REVIEW + 1);
        escrow.claimTimeout(id);
        assertEq(uint8(escrow.getJob(id).status), uint8(FuciEscrow.Status.Released));
        assertEq(escrow.totalLocked(), 0);
        assertEq(escrow.owed(provider), 99e6);
        assertEq(usdc.balanceOf(treasury), 1e6); // the fee still went out
        _solvent();
        vm.prank(provider);
        vm.expectRevert(FuciEscrow.TransferFailed.selector);
        escrow.withdraw(); // still blocked: the freeze holds
        usdc.setBlacklisted(provider, false);
        vm.prank(provider);
        escrow.withdraw();
        assertEq(usdc.balanceOf(provider), 99e6);
        assertEq(escrow.totalOwed(), 0);
        _solvent();
    }

    /// Finding 2: a blocked client with nothing delivered. Before: stuck. Now: refunded into "owed" for the client.
    function test_blockedClientExpired_settlesAndHolds() public {
        uint256 id = _job(address(0));
        usdc.setBlacklisted(client, true);
        vm.warp(block.timestamp + 3 days + 1);
        escrow.refundExpired(id);
        assertEq(escrow.owed(client), AMOUNT);
        assertEq(escrow.totalLocked(), 0);
        _solvent();
    }

    /// Finding 3: a USDC pause during review. Before: the timely reject failed and the provider was paid later.
    /// Now: the reject settles on time; the client collects the refund after the pause.
    function test_pauseDoesNotFlipDispute() public {
        uint256 id = _job(evaluator);
        vm.prank(provider);
        escrow.submit(id, bytes32("junk"), "");
        usdc.setPaused(true);
        vm.prank(evaluator);
        escrow.reject(id);
        assertEq(uint8(escrow.getJob(id).status), uint8(FuciEscrow.Status.Refunded));
        vm.warp(block.timestamp + REVIEW + 1);
        vm.expectRevert(FuciEscrow.WrongStatus.selector);
        escrow.claimTimeout(id);
        usdc.setPaused(false);
        uint256 before = usdc.balanceOf(client);
        vm.prank(client);
        escrow.withdraw();
        assertEq(usdc.balanceOf(client) - before, AMOUNT);
        assertEq(usdc.balanceOf(provider), 0);
        _solvent();
    }

    /// The new gas budget: a stranger can't starve the payout to force it into "held"; the call reverts instead.
    function test_lowGasCallReverts() public {
        uint256 id = _job(evaluator);
        vm.prank(provider);
        escrow.submit(id, bytes32("work"), "");
        vm.warp(block.timestamp + REVIEW + 1);
        (bool ok, ) = address(escrow).call{gas: 150_000}(abi.encodeCall(FuciEscrow.claimTimeout, (id)));
        assertFalse(ok);
        assertEq(escrow.totalLocked(), AMOUNT);
        assertEq(escrow.totalOwed(), 0);
        escrow.claimTimeout(id);
        assertEq(usdc.balanceOf(provider), 99e6);
        assertEq(escrow.totalOwed(), 0);
    }

    /// Held money is not "surplus": the owner can't recover it.
    function test_ownerCannotRecoverHeldUsdc() public {
        uint256 id = _job(evaluator);
        usdc.setBlacklisted(client, true);
        vm.prank(provider);
        escrow.cancel(id);
        assertEq(escrow.owed(client), AMOUNT);
        vm.expectRevert(FuciEscrow.ExceedsSurplus.selector);
        escrow.recoverERC20(address(usdc), 1);
    }

    function test_withdrawNothingReverts() public {
        vm.expectRevert(FuciEscrow.NothingOwed.selector);
        escrow.withdraw();
    }

    /// Only the owed address can collect it; nobody else, owner included.
    function testFuzz_onlyRecipientWithdraws(address who) public {
        vm.assume(who != client && who != address(0));
        uint256 id = _job(evaluator);
        usdc.setBlacklisted(client, true);
        vm.prank(provider);
        escrow.cancel(id);
        usdc.setBlacklisted(client, false);
        vm.prank(who);
        vm.expectRevert(FuciEscrow.NothingOwed.selector);
        escrow.withdraw();
        assertEq(escrow.owed(client), AMOUNT);
    }
}
