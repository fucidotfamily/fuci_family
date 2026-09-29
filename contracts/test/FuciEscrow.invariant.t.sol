// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FuciEscrow} from "../FuciEscrow.sol";
import {MockUSDC} from "./Mocks.sol";

/// @dev Random clients, providers and evaluators create, submit, release, reject, cancel and time out jobs.
contract EscrowHandler is Test {
    FuciEscrow public escrow;
    MockUSDC public usdc;
    address[] public actors;
    uint256[] public ids;

    constructor(FuciEscrow e, MockUSDC u) {
        escrow = e;
        usdc = u;
        for (uint256 i = 0; i < 5; i++) {
            address a = address(uint160(0x1000 + i));
            actors.push(a);
            usdc.mint(a, 1_000_000e6);
            vm.prank(a);
            usdc.approve(address(e), type(uint256).max);
        }
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _job(uint256 s) internal view returns (uint256) {
        return ids.length == 0 ? 0 : ids[s % ids.length];
    }

    function create(uint256 c, uint256 p, uint256 e, uint256 amount, uint256 days_, uint256 review) external {
        address client = _actor(c);
        address provider = _actor(p);
        address evaluator = e % 3 == 0 ? address(0) : _actor(e);
        amount = bound(amount, 10_000, 1_000e6);
        uint64 deadline = uint64(block.timestamp + bound(days_, 1, 30) * 1 days);
        uint32 rp = uint32(bound(review, 1 hours, 30 days));
        vm.prank(client);
        try escrow.createJob(provider, evaluator, amount, deadline, rp, bytes32(amount), "", 500) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function submit(uint256 j) external {
        uint256 id = _job(j);
        FuciEscrow.Job memory job = escrow.getJob(id);
        vm.prank(job.provider);
        try escrow.submit(id, keccak256(abi.encode(id)), "") {} catch {}
    }

    function release(uint256 j, uint256 who) external {
        uint256 id = _job(j);
        vm.prank(_actor(who));
        try escrow.release(id) {} catch {}
    }

    function reject(uint256 j, uint256 who) external {
        uint256 id = _job(j);
        vm.prank(_actor(who));
        try escrow.reject(id) {} catch {}
    }

    function cancel(uint256 j, uint256 who) external {
        uint256 id = _job(j);
        vm.prank(_actor(who));
        try escrow.cancel(id) {} catch {}
    }

    function refundExpired(uint256 j) external {
        try escrow.refundExpired(_job(j)) {} catch {}
    }

    function claimTimeout(uint256 j) external {
        try escrow.claimTimeout(_job(j)) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
    }

    function setFee(uint256 fee) external {
        vm.prank(escrow.owner());
        escrow.setFee(uint16(bound(fee, 0, 500)));
    }

    function setPaused(bool p) external {
        vm.prank(escrow.owner());
        escrow.setPaused(p);
    }

    /// The issuer blocks or unblocks a random actor (Circle's USDC blocklist on Arc).
    function setBlocked(uint256 who, bool b) external {
        usdc.setBlacklisted(_actor(who), b);
    }

    function withdraw(uint256 who) external {
        address a = _actor(who);
        if (escrow.owed(a) == 0) return;
        vm.prank(a);
        try escrow.withdraw() {} catch {}
    }

    function jobIds() external view returns (uint256[] memory) {
        return ids;
    }

    function actorList() external view returns (address[] memory) {
        return actors;
    }
}

contract FuciEscrowInvariantTest is Test {
    FuciEscrow escrow;
    MockUSDC usdc;
    EscrowHandler handler;
    address treasury = address(0xFEE);
    uint256 startSupply;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        escrow = new FuciEscrow(address(usdc), treasury, 100, 1_000e6, 50_000e6);
        handler = new EscrowHandler(escrow, usdc);
        startSupply = usdc.totalSupply();
        targetContract(address(handler));
    }

    /// Held payouts add up: totalOwed is the sum of what each address is owed.
    function invariant_owedAddsUp() public view {
        address[] memory a = handler.actorList();
        uint256 sum = escrow.owed(treasury);
        for (uint256 i = 0; i < a.length; i++) sum += escrow.owed(a[i]);
        assertEq(escrow.totalOwed(), sum);
    }

    /// The escrow always holds at least what it owes, and exactly what it owes (no one sends it extra here).
    function invariant_solvent() public view {
        assertEq(usdc.balanceOf(address(escrow)), escrow.totalLocked() + escrow.totalOwed());
    }

    /// totalLocked is exactly the sum of open jobs.
    function invariant_totalLockedMatchesOpenJobs() public view {
        uint256[] memory ids = handler.jobIds();
        uint256 open;
        for (uint256 i = 0; i < ids.length; i++) {
            FuciEscrow.Job memory j = escrow.getJob(ids[i]);
            if (j.status == FuciEscrow.Status.Funded || j.status == FuciEscrow.Status.Submitted) open += j.amount;
        }
        assertEq(escrow.totalLocked(), open);
        assertLe(escrow.totalLocked(), escrow.maxTotalLocked());
    }

    /// No USDC is created or lost: actors + escrow + treasury always add up to what was minted.
    function invariant_conservation() public view {
        address[] memory a = handler.actorList();
        uint256 sum = usdc.balanceOf(address(escrow)) + usdc.balanceOf(treasury);
        for (uint256 i = 0; i < a.length; i++) sum += usdc.balanceOf(a[i]);
        assertEq(sum, startSupply);
    }

    /// The treasury only ever receives fees: at most 5% of what was released.
    function invariant_feesBounded() public view {
        uint256[] memory ids = handler.jobIds();
        uint256 released;
        for (uint256 i = 0; i < ids.length; i++) {
            FuciEscrow.Job memory j = escrow.getJob(ids[i]);
            if (j.status == FuciEscrow.Status.Released) released += j.amount;
        }
        assertLe(usdc.balanceOf(treasury), (released * 500) / 10_000);
    }
}
