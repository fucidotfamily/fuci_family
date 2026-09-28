// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev USDC-like token: 6 decimals, returns bool, and can blacklist addresses (like Circle's USDC).
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blacklisted;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function setBlacklisted(address a, bool b) external {
        blacklisted[a] = b;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        require(!blacklisted[from] && !blacklisted[to], "blacklisted");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Takes a 1% cut on every transfer: the escrow must refuse such a deposit.
contract FeeOnTransferToken is MockUSDC {
    function _move(address from, address to, uint256 amount) internal override {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount - amount / 100;
    }
}

interface IEscrowLike {
    function release(uint256 jobId) external;
    function refundExpired(uint256 jobId) external;
    function cancel(uint256 jobId) external;
}

/// @dev Calls back into the escrow while it pays out, to prove the reentrancy guard holds.
contract ReentrantToken is MockUSDC {
    IEscrowLike public escrow;
    uint256 public targetJob;
    bool public armed;

    function arm(IEscrowLike e, uint256 jobId) external {
        escrow = e;
        targetJob = jobId;
        armed = true;
    }

    function _move(address from, address to, uint256 amount) internal override {
        super._move(from, to, amount);
        if (armed && from == address(escrow)) {
            armed = false;
            escrow.release(targetJob); // must revert with Reentrancy, failing the whole payout
        }
    }
}
