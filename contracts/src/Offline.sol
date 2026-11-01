// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Admin} from "./Admin.sol";
import {IERC20, SafeToken} from "./SafeToken.sol";
import {IBindingHook, IBindingToken} from "./StockereumBinding.sol";

interface IWrappedEther {
    function balanceOf(address) external view returns (uint256);
    function withdraw(uint256) external;
}

/// @title DM Offline: liquid, token-seconds-weighted ETH rewards.
/// @notice No term, exit fee, forfeiture, compounding or administrator withdrawal.
/// Each ETH funding is allocated to CURRENT deposits by their accumulated token-seconds.
/// Added tokens begin at age zero. Partial withdrawals remove proportional age.
/// Claiming never changes principal or age. Previously earned ETH survives a full exit.
contract Offline is Admin {
    using SafeToken for IERC20;
    uint256 public constant PRECISION = 1e36;
    uint256 public constant LAUNCH_SUPPLY = 1_000_000_000e18;
    IERC20 public token;
    IBindingHook public immutable stockereumHook;
    IWrappedEther public immutable weth;
    address public immutable expectedCreator;
    uint256 public immutable origin;

    struct Position {
        uint256 amount;
        uint256 age;
        uint256 checkpoint;
        uint256 paidAgeIndex;
        uint256 paidTimeIndex;
        uint256 credit;
        uint256 claimed;
        uint256 startedAt;
        uint256 remainder;
    }
    mapping(address => Position) private _positions;
    address[] public participants;
    mapping(address => bool) private _seen;
    uint256 public totalDeposited;
    uint256 private _totalAge;
    uint256 private _ageUpdatedAt;
    uint256 public ageIndex;
    uint256 public timeIndex;
    uint256 public totalFunded;
    uint256 public totalClaimed;
    uint256 public lastFundedAt;
    bool public depositsPaused;
    uint256 private _guard = 1;

    event TokenBound(address indexed token);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Funded(address indexed from, uint256 amount, uint256 tokenSeconds, uint256 cumulative);
    event Claimed(address indexed user, address indexed recipient, uint256 amount);
    event DepositsPausedSet(bool paused);
    error Reentrancy();
    error InvalidLaunch();
    error AlreadyBound();
    error NotBound();
    error BadAmount();
    error DepositsPaused();
    error NoEligibleDeposits();
    error NothingToClaim();
    error TransferMismatch();
    error EthTransferFailed();
    error FundingTooSmall();

    modifier nonReentrant() {
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _;
        _guard = 1;
    }

    constructor(address hook_, address weth_, address creator_) Admin(creator_) {
        if (hook_.code.length == 0 || weth_.code.length == 0) revert InvalidLaunch();
        stockereumHook = IBindingHook(hook_);
        weth = IWrappedEther(weth_);
        expectedCreator = creator_;
        origin = block.timestamp;
    }

    /// @notice Bind once, AFTER launching with this deployment's original creator.
    function bindToken(address candidate) external onlyAdmin nonReentrant {
        if (address(token) != address(0)) revert AlreadyBound();
        if (candidate.code.length == 0 || candidate == address(weth)) revert InvalidLaunch();
        IBindingToken t = IBindingToken(candidate);
        if (
            t.factory() != stockereumHook.factory() || t.creator() != expectedCreator
                || t.totalSupply() != LAUNCH_SUPPLY || t.distributor() != address(0)
        ) revert InvalidLaunch();
        (address c0, address c1) = candidate < address(weth) ? (candidate, address(weth)) : (address(weth), candidate);
        bytes32 poolId = keccak256(abi.encode(c0, c1, uint24(0), int24(200), address(stockereumHook)));
        IBindingHook.Launch memory launch = stockereumHook.getLaunch(poolId);
        if (
            launch.token != candidate || launch.quote != address(weth) || launch.feeRecipient != expectedCreator
                || launch.feePpm != 30_000 || launch.feesToHolders
        ) {
            revert InvalidLaunch();
        }
        token = IERC20(candidate);
        emit TokenBound(candidate);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (address(token) == address(0)) revert NotBound();
        if (depositsPaused) revert DepositsPaused();
        if (amount == 0 || amount > LAUNCH_SUPPLY - totalDeposited) revert BadAmount();
        _checkpoint(msg.sender);
        Position storage p = _positions[msg.sender];
        if (p.amount == 0) p.startedAt = block.timestamp;
        p.amount += amount;
        totalDeposited += amount;
        if (!_seen[msg.sender]) {
            _seen[msg.sender] = true;
            participants.push(msg.sender);
        }
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert TransferMismatch();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Always available, including while deposits are paused. Earned ETH remains claimable.
    function withdraw(uint256 amount) external nonReentrant {
        Position storage p = _positions[msg.sender];
        if (amount == 0 || amount > p.amount) revert BadAmount();
        _checkpoint(msg.sender);
        uint256 removedAge = amount == p.amount ? p.age : p.age * amount / p.amount;
        p.age -= removedAge;
        _totalAge -= removedAge;
        p.amount -= amount;
        totalDeposited -= amount;
        if (p.amount == 0) p.startedAt = 0;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice A recipient can differ from the depositor, supporting smart wallets rejecting ETH.
    function claim(address payable recipient) external nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert ZeroAddress();
        _checkpoint(msg.sender);
        Position storage p = _positions[msg.sender];
        uint256 amount = p.credit;
        if (amount == 0) revert NothingToClaim();
        p.credit = 0;
        p.claimed += amount;
        totalClaimed += amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit Claimed(msg.sender, recipient, amount);
    }

    function fund() external payable nonReentrant {
        _fund(msg.sender, msg.value);
    }

    /// @notice ETH pairs pay creator fees in WETH. Anyone may convert WETH sent to Offline.
    function fundWeth() external nonReentrant {
        uint256 amount = weth.balanceOf(address(this));
        if (amount == 0) revert BadAmount();
        weth.withdraw(amount);
        _fund(msg.sender, amount);
    }

    receive() external payable {
        if (msg.sender == address(weth)) return;
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _fund(msg.sender, msg.value);
        _guard = 1;
    }

    function setDepositsPaused(bool paused) external onlyAdmin {
        depositsPaused = paused;
        emit DepositsPausedSet(paused);
    }

    function _canRenounce() internal view override returns (bool) {
        return !depositsPaused && address(token) != address(0);
    }

    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    function totalTokenSeconds() public view returns (uint256) {
        return _totalAge + totalDeposited * (_time() - _ageUpdatedAt);
    }

    function account(address user)
        external
        view
        returns (uint256 amount, uint256 tokenSeconds, uint256 claimable, uint256 claimed, uint256 startedAt)
    {
        Position storage p = _positions[user];
        return (
            p.amount,
            p.age + p.amount * (_time() - p.checkpoint),
            p.credit + (_pendingScaled(p) + p.remainder) / PRECISION,
            p.claimed,
            p.startedAt
        );
    }

    /// @dev Two cumulative indices integrate each linear token-age without looping over users.
    function _fund(address from, uint256 amount) internal {
        if (address(token) == address(0)) revert NotBound();
        if (amount == 0) revert BadAmount();
        _updateAge();
        if (_totalAge == 0) revert NoEligibleDeposits();
        uint256 increment = amount * PRECISION / _totalAge;
        if (increment == 0) revert FundingTooSmall();
        ageIndex += increment;
        timeIndex += increment * _time();
        totalFunded += amount;
        lastFundedAt = block.timestamp;
        emit Funded(from, amount, _totalAge, totalFunded);
    }

    function _checkpoint(address user) internal {
        _updateAge();
        Position storage p = _positions[user];
        uint256 scaled = _pendingScaled(p) + p.remainder;
        p.credit += scaled / PRECISION;
        p.remainder = scaled % PRECISION;
        p.age += p.amount * (_time() - p.checkpoint);
        p.checkpoint = _time();
        p.paidAgeIndex = ageIndex;
        p.paidTimeIndex = timeIndex;
    }

    function _pendingScaled(Position storage p) internal view returns (uint256) {
        uint256 delta = ageIndex - p.paidAgeIndex;
        return p.age * delta + p.amount * (timeIndex - p.paidTimeIndex - p.checkpoint * delta);
    }

    function _updateAge() internal {
        _totalAge = totalTokenSeconds();
        _ageUpdatedAt = _time();
    }

    function _time() internal view returns (uint256) {
        return block.timestamp - origin;
    }
}
