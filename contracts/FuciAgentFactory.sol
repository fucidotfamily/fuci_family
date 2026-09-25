// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal ERC-20 surface (Arc's USDC ERC-20 interface, 6 decimals).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice ERC-8004 Identity Registry: `register` mints an agent NFT to the caller.
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @title FuciAgentFactory
 * @notice Creates a Fuci agent on Arc in one call:
 *   1. charges the creation fee (1 USDC) and sends it straight to the treasury,
 *   2. registers the agent in the ERC-8004 Identity Registry and hands the identity NFT to the caller,
 *   3. records the agent and emits AgentCreated(agentId, owner, feePaid, name, agentURI).
 * The agentId is the ERC-8004 agentId, so one id works across Arc's agent stack.
 *
 * Safety:
 *   - The contract never holds user funds: the fee goes from the caller to the treasury in the same call.
 *   - Callers pass `maxFee`, so a fee change can never charge them more than they agreed to.
 *   - Reentrancy guard, pause switch, two-step ownership transfer, fee capped at MAX_FEE.
 *   - Only the identity it is minting right now is accepted as an NFT; anything else is rejected.
 *   - Tokens sent here by mistake can only be recovered to the treasury.
 */
contract FuciAgentFactory {
    IERC20 public immutable usdc;
    IIdentityRegistry public immutable identityRegistry;

    address public owner;
    address public pendingOwner;
    address public treasury;
    /// @notice Creation fee in USDC base units (6 decimals). 1_000_000 = 1 USDC.
    uint256 public fee;
    /// @notice Upper bound on the fee (100 USDC).
    uint256 public constant MAX_FEE = 100_000_000;
    bool public paused;

    uint256 public agentsCreated;

    struct Agent {
        address creator;
        uint64 createdAt;
        uint256 feePaid;
        string name;
        string agentURI;
    }

    /// @notice agentId (ERC-8004) => creation record.
    mapping(uint256 => Agent) public agents;

    uint256 private _locked = 1;
    bool private _minting;

    event AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI);
    event FeeChanged(uint256 fee);
    event TreasuryChanged(address treasury);
    event Paused(bool paused);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Recovered(address indexed token, uint256 amount, address to);

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error FeeTooHigh();
    error FeeAboveMax(uint256 fee, uint256 maxFee);
    error BadName();
    error BadURI();
    error BadTreasury();
    error IsPaused();
    error Reentrancy();
    error UnexpectedNFT();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address usdc_, address identityRegistry_, address treasury_, uint256 fee_) {
        if (usdc_ == address(0) || identityRegistry_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert BadTreasury();
        if (fee_ > MAX_FEE) revert FeeTooHigh();
        usdc = IERC20(usdc_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
        treasury = treasury_;
        fee = fee_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryChanged(treasury_);
        emit FeeChanged(fee_);
    }

    /// @notice Create an agent on Arc. The caller must have approved at least `fee` USDC to this contract.
    /// @param name Display name of the agent (1–64 bytes).
    /// @param agentURI ERC-8004 registration file URL for the agent (1–512 bytes).
    /// @param maxFee The most the caller agrees to pay; reverts if the current fee is higher.
    function createAgent(string calldata name, string calldata agentURI, uint256 maxFee) external nonReentrant returns (uint256 agentId) {
        if (paused) revert IsPaused();
        if (bytes(name).length == 0 || bytes(name).length > 64) revert BadName();
        if (bytes(agentURI).length == 0 || bytes(agentURI).length > 512) revert BadURI();
        uint256 paid = fee;
        if (paid > maxFee) revert FeeAboveMax(paid, maxFee);

        // Fee goes straight from the caller to the treasury; this contract never holds it.
        if (paid > 0) _safeTransferFrom(msg.sender, treasury, paid);

        _minting = true;
        agentId = identityRegistry.register(agentURI);
        _minting = false;
        identityRegistry.transferFrom(address(this), msg.sender, agentId);

        agents[agentId] = Agent({ creator: msg.sender, createdAt: uint64(block.timestamp), feePaid: paid, name: name, agentURI: agentURI });
        unchecked {
            ++agentsCreated;
        }
        emit AgentCreated(agentId, msg.sender, paid, name, agentURI);
    }

    /// @dev Accepts only the identity NFT being minted inside createAgent.
    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (!_minting || msg.sender != address(identityRegistry)) revert UnexpectedNFT();
        return this.onERC721Received.selector;
    }

    // ---- owner ----

    function setFee(uint256 fee_) external onlyOwner {
        if (fee_ > MAX_FEE) revert FeeTooHigh();
        fee = fee_;
        emit FeeChanged(fee_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert BadTreasury();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    /// @notice Step 1 of 2: propose a new owner, who must call acceptOwnership.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step 2 of 2: the proposed owner takes over.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    /// @notice Recover ERC-20 tokens sent here by mistake. They can only go to the treasury.
    function recoverERC20(address token, uint256 amount) external onlyOwner nonReentrant {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (treasury, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        emit Recovered(token, amount, treasury);
    }

    // ---- internal ----

    /// @dev Works with tokens that return `true`, return nothing, or revert on failure.
    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
