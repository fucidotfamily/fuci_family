// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FuciEscrow} from "../../FuciEscrow.sol";

interface IUSDC {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev A party in a job: a plain contract with no payable receive(), so the run also proves that
///      USDC can be paid to a contract on Arc.
contract Party {
    function exec(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}

/// @dev Runs FuciEscrow end to end against Arc's real USDC inside one eth_call (with a state override that
///      gives this harness some USDC). Nothing is broadcast. Reverts with a reason on the first wrong number.
contract ArcHarness {
    IUSDC constant USDC = IUSDC(0x3600000000000000000000000000000000000000);

    function _eq(uint256 a, uint256 b, string memory what) private pure {
        if (a != b) revert(string.concat(what, ": got ", _s(a), " want ", _s(b)));
    }

    function _s(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v > 0) {
            b = abi.encodePacked(bytes1(uint8(48 + (v % 10))), b);
            v /= 10;
        }
        return string(b);
    }

    function run() external returns (uint256[8] memory out) {
        Party treasury = new Party();
        Party provider = new Party();
        Party evaluator = new Party();
        FuciEscrow escrow = new FuciEscrow(address(USDC), address(treasury), 100, 100e6, 5_000e6);
        require(USDC.approve(address(escrow), type(uint256).max), "approve");
        uint256 start = USDC.balanceOf(address(this));
        uint64 d = uint64(block.timestamp + 1 days);

        // 1. create + submit + release by the client: provider gets 99%, treasury 1%.
        uint256 a = escrow.createJob(address(provider), address(evaluator), 10e6, d, 1 hours, keccak256("a"), "", 100);
        _eq(USDC.balanceOf(address(escrow)), 10e6, "escrow after create");
        _eq(escrow.totalLocked(), 10e6, "totalLocked after create");
        provider.exec(address(escrow), abi.encodeCall(FuciEscrow.submit, (a, keccak256("wa"), "")));
        escrow.release(a);
        _eq(USDC.balanceOf(address(provider)), 9.9e6, "provider paid");
        _eq(USDC.balanceOf(address(treasury)), 0.1e6, "treasury fee");

        // 2. evaluator rejects: client refunded in full, no fee.
        uint256 b = escrow.createJob(address(provider), address(evaluator), 3e6, d, 1 hours, keccak256("b"), "", 100);
        provider.exec(address(escrow), abi.encodeCall(FuciEscrow.submit, (b, keccak256("wb"), "")));
        evaluator.exec(address(escrow), abi.encodeCall(FuciEscrow.reject, (b)));

        // 3. provider cancels: client refunded.
        uint256 c = escrow.createJob(address(provider), address(evaluator), 2e6, d, 1 hours, keccak256("c"), "", 100);
        provider.exec(address(escrow), abi.encodeCall(FuciEscrow.cancel, (c)));

        // 4. the evaluator pays: provider gets 99% of 1 USDC.
        uint256 e = escrow.createJob(address(provider), address(evaluator), 1e6, d, 1 hours, keccak256("e"), "", 100);
        evaluator.exec(address(escrow), abi.encodeCall(FuciEscrow.release, (e)));

        _eq(escrow.totalLocked(), 0, "totalLocked at end");
        _eq(USDC.balanceOf(address(escrow)), 0, "escrow empty at end");
        _eq(USDC.balanceOf(address(provider)), 9.9e6 + 0.99e6, "provider total");
        _eq(USDC.balanceOf(address(treasury)), 0.1e6 + 0.01e6, "treasury total");
        _eq(start - USDC.balanceOf(address(this)), 11e6, "client spent (10 + 1 paid, 5 refunded)");

        // 5. a short deposit is impossible, and locked USDC can't be recovered by the owner.
        escrow.createJob(address(provider), address(evaluator), 4e6, d, 1 hours, keccak256("f"), "", 100);
        try escrow.recoverERC20(address(USDC), 1) {
            revert("owner recovered locked USDC");
        } catch {}

        out = [start, USDC.balanceOf(address(this)), USDC.balanceOf(address(provider)), USDC.balanceOf(address(treasury)), USDC.balanceOf(address(escrow)), escrow.totalLocked(), escrow.jobCount(), block.number];
    }
}
