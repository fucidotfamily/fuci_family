// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal ERC-20 surface (Arc's USDC ERC-20 interface, 6 decimals).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title FuciEscrow
 * @notice Escrow for jobs between AI agents on Arc, paid in USDC.
 *
 * A client (a person or an agent) locks USDC for a job. The provider (the agent doing the work)
 * submits a deliverable. Then:
 *   - the client or the evaluator releases the money to the provider, or
 *   - the evaluator rejects the deliverable during the review period and the client is refunded, or
 *   - nobody answers during the review period, and anyone can pay the provider (claimTimeout), or
 *   - the provider never submits by the deadline, and anyone can refund the client (refundExpired), or
 *   - the provider cancels at any time and the client is refunded.
 * The evaluator is chosen by the client when the job is created (itself by default) and can never be the provider.
 *
 * Safety:
 *   - Nobody, including the owner, can move a job's USDC anywhere except to that job's client or provider
 *     (minus the fee, set when the job was created and capped at MAX_FEE_BPS). There is no admin withdraw.
 *   - Every path out of a job keeps working while the contract is paused; pausing only stops new jobs.
 *   - Settlement is final: a job moves Funded -> Submitted -> Released/Refunded once, checks-effects-interactions,
 *     plus a reentrancy guard.
 *   - Deposits are checked by balance difference, so a short transfer can never be counted as a full one.
 *   - Launch caps on the size of one job and on the total held; changing them never touches existing jobs.
 *   - Two-step ownership; the owner is meant to be the treasury Safe multisig.
 *   - Tokens sent here by mistake can be recovered to the treasury, but never USDC that belongs to a job
 *     or is held for someone: only the surplus above totalLocked + totalOwed.
 *   - A job always settles, even if USDC refuses the payout (a recipient blocked by the issuer, or USDC paused).
 *     The amount is then held for that same address and paid by withdraw() once USDC allows it. It can never
 *     be redirected, so an issuer freeze stays a freeze, and a pause can't stop a timely reject or refund.
 */
contract FuciEscrow {
    IERC20 public immutable usdc;

    enum Status {
        None,
        Funded,
        Submitted,
        Released,
        Refunded
    }

    struct Job {
        address client;
        uint64 deadline; // provider must submit by this time
        uint32 reviewPeriod; // seconds the evaluator has after a submission
        address provider;
        uint64 reviewDeadline; // set on submit
        uint16 feeBps; // fee taken from the provider's payout, fixed at creation
        Status status;
        address evaluator;
        uint128 amount;
        bytes32 termsHash;
        bytes32 deliverable;
    }

    /// @notice 0.01 USDC.
    uint256 public constant MIN_AMOUNT = 10_000;
    /// @notice Hard ceiling for maxJobAmount: 1,000,000 USDC.
    uint256 public constant HARD_MAX_JOB = 1_000_000e6;
    /// @notice Fee ceiling: 5%.
    uint16 public constant MAX_FEE_BPS = 500;
    uint32 public constant MIN_REVIEW = 1 hours;
    uint32 public constant MAX_REVIEW = 30 days;
    uint64 public constant MAX_DURATION = 180 days;
    uint256 public constant MAX_URI = 512;
    /// @notice Gas given to each payout transfer (Arc's USDC transfer uses about 30-55k). A caller who sends too
    /// little gas can't push a payout into "held" on purpose: the whole call reverts instead.
    uint256 public constant SEND_GAS = 200_000;

    address public owner;
    address public pendingOwner;
    address public treasury;
    uint16 public feeBps;
    bool public paused;
    /// @notice Launch caps (USDC base units).
    uint256 public maxJobAmount;
    uint256 public maxTotalLocked;

    /// @notice USDC currently held for open jobs.
    uint256 public totalLocked;
    /// @notice Settled payouts USDC refused to deliver, held per recipient until withdraw().
    mapping(address => uint256) public owed;
    uint256 public totalOwed;
    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;

    uint256 private _locked = 1;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 amount,
        uint16 feeBps,
        uint64 deadline,
        uint32 reviewPeriod,
        bytes32 termsHash,
        string termsURI
    );
    event DeadlineExtended(uint256 indexed jobId, uint64 deadline);
    event Submitted(uint256 indexed jobId, bytes32 deliverable, string deliverableURI, uint64 reviewDeadline);
    event Released(uint256 indexed jobId, address indexed provider, uint256 paid, uint256 fee, address by);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount, address by);
    event FeeChanged(uint16 feeBps);
    event TreasuryChanged(address indexed treasury);
    event LimitsChanged(uint256 maxJobAmount, uint256 maxTotalLocked);
    event Paused(bool paused);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Recovered(address indexed token, uint256 amount, address to);
    event PaymentHeld(uint256 indexed jobId, address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error BadTreasury();
    error FeeTooHigh();
    error FeeAboveMax(uint16 feeBps, uint16 maxFeeBps);
    error BadLimits();
    error IsPaused();
    error Reentrancy();
    error BadParty();
    error BadAmount();
    error OverCap();
    error BadDeadline();
    error BadReview();
    error BadURI();
    error BadDeliverable();
    error WrongStatus();
    error NotAllowed();
    error TooEarly();
    error TooLate();
    error TransferFailed();
    error ShortDeposit();
    error ExceedsSurplus();
    error NothingOwed();
    error LowGas();
    error NotAContract();

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

    constructor(address usdc_, address treasury_, uint16 feeBps_, uint256 maxJobAmount_, uint256 maxTotalLocked_) {
        if (usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert NotAContract();
        if (treasury_ == address(this)) revert BadTreasury();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        _checkLimits(maxJobAmount_, maxTotalLocked_);
        usdc = IERC20(usdc_);
        owner = msg.sender;
        treasury = treasury_;
        feeBps = feeBps_;
        maxJobAmount = maxJobAmount_;
        maxTotalLocked = maxTotalLocked_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryChanged(treasury_);
        emit FeeChanged(feeBps_);
        emit LimitsChanged(maxJobAmount_, maxTotalLocked_);
    }

    // ---------------------------------------------------------------------
    // Jobs

    /**
     * @notice Lock `amount` USDC for a job. The caller (client) must have approved at least `amount` to this contract.
     * @param provider Who gets paid when the job is done. Not the caller, not the evaluator.
     * @param evaluator Who may approve or reject the work; address(0) means the client.
     * @param deadline Unix time by which the provider must submit (at most MAX_DURATION from now).
     * @param reviewPeriod Seconds the evaluator has to review a submission (MIN_REVIEW..MAX_REVIEW).
     * @param termsHash keccak256 of the job terms (stored off-chain at termsURI).
     * @param maxFeeBps The highest fee the caller accepts; reverts if the current fee is higher.
     */
    function createJob(
        address provider,
        address evaluator,
        uint256 amount,
        uint64 deadline,
        uint32 reviewPeriod,
        bytes32 termsHash,
        string calldata termsURI,
        uint16 maxFeeBps
    ) external nonReentrant returns (uint256 jobId) {
        if (paused) revert IsPaused();
        if (evaluator == address(0)) evaluator = msg.sender;
        if (provider == address(0) || provider == msg.sender || provider == evaluator || provider == address(this) || evaluator == address(this)) revert BadParty();
        if (amount < MIN_AMOUNT || amount > maxJobAmount) revert BadAmount();
        if (totalLocked + amount > maxTotalLocked) revert OverCap();
        if (deadline <= block.timestamp || deadline > block.timestamp + MAX_DURATION) revert BadDeadline();
        if (reviewPeriod < MIN_REVIEW || reviewPeriod > MAX_REVIEW) revert BadReview();
        if (bytes(termsURI).length > MAX_URI) revert BadURI();
        uint16 fee = feeBps;
        if (fee > maxFeeBps) revert FeeAboveMax(fee, maxFeeBps);

        jobId = ++jobCount;
        _jobs[jobId] = Job({
            client: msg.sender,
            deadline: deadline,
            reviewPeriod: reviewPeriod,
            provider: provider,
            reviewDeadline: 0,
            feeBps: fee,
            status: Status.Funded,
            evaluator: evaluator,
            amount: uint128(amount),
            termsHash: termsHash,
            deliverable: bytes32(0)
        });
        totalLocked += amount;

        uint256 before = usdc.balanceOf(address(this));
        _safeTransferFrom(msg.sender, address(this), amount);
        if (usdc.balanceOf(address(this)) - before != amount) revert ShortDeposit();

        emit JobCreated(jobId, msg.sender, provider, evaluator, amount, fee, deadline, reviewPeriod, termsHash, termsURI);
    }

    /// @notice The client gives the provider more time (only before a submission).
    function extendDeadline(uint256 jobId, uint64 newDeadline) external {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Funded) revert WrongStatus();
        if (msg.sender != j.client) revert NotAllowed();
        if (newDeadline <= j.deadline || newDeadline > block.timestamp + MAX_DURATION) revert BadDeadline();
        j.deadline = newDeadline;
        emit DeadlineExtended(jobId, newDeadline);
    }

    /// @notice The provider hands in the work (by the deadline). Starts the review period.
    function submit(uint256 jobId, bytes32 deliverable, string calldata deliverableURI) external {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Funded) revert WrongStatus();
        if (msg.sender != j.provider) revert NotAllowed();
        if (block.timestamp > j.deadline) revert TooLate();
        if (deliverable == bytes32(0)) revert BadDeliverable();
        if (bytes(deliverableURI).length > MAX_URI) revert BadURI();
        uint64 reviewDeadline = uint64(block.timestamp) + j.reviewPeriod;
        j.status = Status.Submitted;
        j.deliverable = deliverable;
        j.reviewDeadline = reviewDeadline;
        emit Submitted(jobId, deliverable, deliverableURI, reviewDeadline);
    }

    /// @notice Pay the provider. The client can always release; so can the evaluator.
    function release(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Funded && j.status != Status.Submitted) revert WrongStatus();
        if (msg.sender != j.client && msg.sender != j.evaluator) revert NotAllowed();
        _payProvider(jobId, j);
    }

    /// @notice The evaluator rejects a submission during the review period; the client is refunded.
    function reject(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Submitted) revert WrongStatus();
        if (msg.sender != j.evaluator) revert NotAllowed();
        if (block.timestamp > j.reviewDeadline) revert TooLate();
        _refund(jobId, j);
    }

    /// @notice The provider walks away from the job; the client is refunded.
    function cancel(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Funded && j.status != Status.Submitted) revert WrongStatus();
        if (msg.sender != j.provider) revert NotAllowed();
        _refund(jobId, j);
    }

    /// @notice Nothing was submitted by the deadline: anyone can send the money back to the client.
    function refundExpired(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Funded) revert WrongStatus();
        if (block.timestamp <= j.deadline) revert TooEarly();
        _refund(jobId, j);
    }

    /// @notice The review period ended without an answer: anyone can pay the provider.
    function claimTimeout(uint256 jobId) external nonReentrant {
        Job storage j = _jobs[jobId];
        if (j.status != Status.Submitted) revert WrongStatus();
        if (block.timestamp <= j.reviewDeadline) revert TooEarly();
        _payProvider(jobId, j);
    }

    /// @notice Collect a payout that USDC refused earlier (the recipient was blocked or USDC was paused).
    /// Always pays the address the job settled to; reverts while USDC still refuses it.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        _safeTransfer(address(usdc), msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    // ---------------------------------------------------------------------
    // Owner

    function setFee(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeChanged(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert BadTreasury();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @notice Caps for new jobs only.
    function setLimits(uint256 maxJobAmount_, uint256 maxTotalLocked_) external onlyOwner {
        _checkLimits(maxJobAmount_, maxTotalLocked_);
        maxJobAmount = maxJobAmount_;
        maxTotalLocked = maxTotalLocked_;
        emit LimitsChanged(maxJobAmount_, maxTotalLocked_);
    }

    /// @notice Stops new jobs. Submitting, releasing, rejecting, cancelling and refunds keep working.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    /// @notice Recover tokens sent here by mistake, to the treasury. For USDC, only the surplus above totalLocked.
    function recoverERC20(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(usdc)) {
            uint256 bal = usdc.balanceOf(address(this));
            uint256 held = totalLocked + totalOwed;
            if (bal < held || amount > bal - held) revert ExceedsSurplus();
        }
        address to = treasury;
        _safeTransfer(token, to, amount);
        emit Recovered(token, amount, to);
    }

    // ---------------------------------------------------------------------
    // Internal

    function _payProvider(uint256 jobId, Job storage j) private {
        uint256 amount = j.amount;
        uint256 fee = (amount * j.feeBps) / 10_000;
        address provider = j.provider;
        j.status = Status.Released;
        totalLocked -= amount;
        emit Released(jobId, provider, amount - fee, fee, msg.sender);
        _send(jobId, provider, amount - fee);
        if (fee > 0) _send(jobId, treasury, fee);
    }

    function _refund(uint256 jobId, Job storage j) private {
        uint256 amount = j.amount;
        address client = j.client;
        j.status = Status.Refunded;
        totalLocked -= amount;
        emit Refunded(jobId, client, amount, msg.sender);
        _send(jobId, client, amount);
    }

    /// @dev Pays a settled amount, or holds it for `to` if USDC refuses (blocked recipient, USDC paused).
    function _send(uint256 jobId, address to, uint256 amount) private {
        if (gasleft() < SEND_GAS + SEND_GAS / 63 + 20_000) revert LowGas();
        bytes memory callData = abi.encodeCall(IERC20.transfer, (to, amount));
        address token = address(usdc);
        bool ok;
        // Reads at most 32 bytes of return data (no return-data bomb); success = the call didn't revert and
        // returned nothing or `true`.
        assembly ("memory-safe") {
            ok := call(SEND_GAS, token, 0, add(callData, 0x20), mload(callData), 0, 0x20)
            if returndatasize() {
                ok := and(ok, and(gt(returndatasize(), 0x1f), eq(mload(0), 1)))
            }
        }
        if (ok) return;
        owed[to] += amount;
        totalOwed += amount;
        emit PaymentHeld(jobId, to, amount);
    }

    function _checkLimits(uint256 maxJob, uint256 maxTotal) private pure {
        if (maxJob < MIN_AMOUNT || maxJob > HARD_MAX_JOB || maxTotal < maxJob) revert BadLimits();
    }

    /// @dev Works with tokens that return `true`, return nothing, or revert on failure.
    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool))) || (data.length == 0 && token.code.length == 0)) revert TransferFailed();
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
