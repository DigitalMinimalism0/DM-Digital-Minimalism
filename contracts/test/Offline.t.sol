// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Offline} from "../src/Offline.sol";
import {IBindingHook} from "../src/StockereumBinding.sol";

contract MockToken {
    address public factory;
    address public creator;
    address public distributor;
    uint256 public constant totalSupply = 1_000_000_000e18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address f, address c) {
        factory = f;
        creator = c;
    }

    function mint(address user, uint256 amount) external {
        balanceOf[user] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockWeth {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}

contract MockEscrow {
    mapping(address => mapping(address => uint256)) public claimable;

    function credit(address account_, address currency, uint256 amount) external {
        claimable[account_][currency] += amount;
    }

    function claim(address currency, address to) external returns (uint256 amount) {
        amount = claimable[msg.sender][currency];
        claimable[msg.sender][currency] = 0;
        require(MockWeth(currency).transfer(to, amount));
    }
}

contract MockHook is IBindingHook {
    address public factory = address(0xFAC);
    Launch private launch;

    function configure(address t, address q, address c, uint24 fee, bool holders) external {
        launch.token = t;
        launch.quote = q;
        launch.feeRecipient = c;
        launch.feePpm = fee;
        launch.feesToHolders = holders;
    }

    function getLaunch(bytes32) external view returns (Launch memory) {
        return launch;
    }
}

contract RejectEther {
    receive() external payable {
        revert();
    }
}

contract OfflineTest is Test {
    Offline internal off;
    MockToken internal token;
    MockHook internal hook;
    MockWeth internal weth;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        vm.warp(100 days);
        hook = new MockHook();
        weth = new MockWeth();
        off = new Offline(address(hook), address(weth), address(this));
        token = new MockToken(hook.factory(), address(this));
        hook.configure(address(token), address(weth), address(this), 30_000, false);
        off.bindToken(address(token));
        vm.deal(address(this), 1000 ether);
        token.mint(alice, 1_000_000e18);
        token.mint(bob, 1_000_000e18);
        vm.prank(alice);
        token.approve(address(off), type(uint256).max);
        vm.prank(bob);
        token.approve(address(off), type(uint256).max);
    }

    function deposit(address user, uint256 amount) internal {
        vm.prank(user);
        off.deposit(amount);
    }

    function earned(address user) internal view returns (uint256 n) {
        (,, n,,) = off.account(user);
    }

    function testQuantityAndTimeWeighted() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        deposit(bob, 100e18);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 3 ether}();
        assertApproxEqAbs(earned(alice), 2 ether, 1);
        assertApproxEqAbs(earned(bob), 1 ether, 1);
    }

    function testAddedTokensHaveNoInheritedAge() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        deposit(alice, 900e18);
        deposit(bob, 1000e18);
        off.fund{value: 1 ether}();
        assertApproxEqAbs(earned(alice), 1 ether, 1);
        assertEq(earned(bob), 0);
    }

    function testNoFlashDepositReward() public {
        deposit(alice, 1e18);
        vm.warp(block.timestamp + 1 days);
        deposit(bob, 1_000_000e18);
        off.fund{value: 1 ether}();
        assertEq(earned(bob), 0);
        vm.prank(bob);
        off.withdraw(1_000_000e18);
        assertApproxEqAbs(earned(alice), 1 ether, 1);
    }

    function testImmediateExitNoFeeAndEarnedSurvives() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1);
        off.fund{value: 1 ether}();
        off.setDepositsPaused(true);
        vm.prank(alice);
        off.withdraw(100e18);
        assertEq(token.balanceOf(alice), 1_000_000e18);
        uint256 credit = earned(alice);
        assertApproxEqAbs(credit, 1 ether, 1);
        vm.prank(alice);
        off.claim(payable(alice));
        assertEq(alice.balance, credit);
    }

    function testPartialWithdrawalPreservesProportionalAge() public {
        deposit(alice, 100e18);
        deposit(bob, 100e18);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        off.withdraw(50e18);
        (, uint256 age,,,) = off.account(alice);
        assertEq(age, 50e18 * 1 days);
        off.fund{value: 3 ether}();
        assertApproxEqAbs(earned(alice), 1 ether, 1);
        assertApproxEqAbs(earned(bob), 2 ether, 1);
    }

    function testClaimDoesNotResetTime() public {
        deposit(alice, 100e18);
        deposit(bob, 100e18);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 2 ether}();
        vm.prank(alice);
        off.claim(payable(alice));
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 2 ether}();
        (,,, uint256 claimed,) = off.account(alice);
        assertApproxEqAbs(claimed, 1 ether, 1);
        assertApproxEqAbs(earned(alice), 1 ether, 1);
        assertApproxEqAbs(earned(bob), 2 ether, 1);
    }

    function testReentryDoesNotKeepExitedAge() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        off.withdraw(100e18);
        deposit(alice, 100e18);
        (, uint256 age,,,) = off.account(alice);
        assertEq(age, 0);
    }

    function testNoRetroactiveRewardsForNewDeposits() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 1 ether}();
        deposit(bob, 100e18);
        assertEq(earned(bob), 0);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 3 ether}();
        assertApproxEqAbs(earned(alice), 3 ether, 2);
        assertApproxEqAbs(earned(bob), 1 ether, 1);
    }

    function testRejectingEthCannotTrapPrincipal() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1);
        off.fund{value: 1 ether}();
        RejectEther rejecting = new RejectEther();
        vm.prank(alice);
        vm.expectRevert(Offline.EthTransferFailed.selector);
        off.claim(payable(address(rejecting)));
        vm.prank(alice);
        off.withdraw(100e18);
        vm.prank(alice);
        off.claim(payable(bob));
        assertGt(bob.balance, 0);
    }

    function testWethFundingPaysNativeEth() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        weth.deposit{value: 1 ether}();
        assertTrue(weth.transfer(address(off), 1 ether));
        off.fundWeth();
        vm.prank(alice);
        off.claim(payable(alice));
        assertApproxEqAbs(alice.balance, 1 ether, 1);
    }

    function testRejectFundingWithNoAge() public {
        vm.expectRevert(Offline.NoEligibleDeposits.selector);
        off.fund{value: 1 ether}();
        deposit(alice, 100e18);
        vm.expectRevert(Offline.NoEligibleDeposits.selector);
        off.fund{value: 1 ether}();
    }

    function testBindingRejectsWrongFeeAndCannotChange() public {
        Offline fresh = new Offline(address(hook), address(weth), address(this));
        hook.configure(address(token), address(weth), address(this), 20_000, false);
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(token));
        vm.expectRevert(Offline.AlreadyBound.selector);
        off.bindToken(address(token));
    }

    function testFuzzConservation(uint96 a, uint96 b, uint32 dt, uint96 funding) public {
        uint256 x = bound(a, 1, 500_000e18);
        uint256 y = bound(b, 1, 500_000e18);
        uint256 reward = bound(funding, 1, 100 ether);
        deposit(alice, x);
        vm.warp(block.timestamp + bound(dt, 1, 365 days));
        deposit(bob, y);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: reward}();
        assertLe(earned(alice) + earned(bob), reward);
        assertApproxEqAbs(earned(alice) + earned(bob), reward, 2);
        vm.prank(alice);
        off.withdraw(x);
        vm.prank(bob);
        off.withdraw(y);
        assertEq(off.totalDeposited(), 0);
        assertEq(off.totalTokenSeconds(), 0);
    }
    receive() external payable {}
}

contract Handler is Test {
    Offline public off;
    MockToken public token;
    address[3] public users = [address(101), address(102), address(103)];

    constructor(Offline o, MockToken t) {
        off = o;
        token = t;
        for (uint256 i; i < 3; ++i) {
            token.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            token.approve(address(off), type(uint256).max);
        }
    }

    function step(uint256 seed, uint256 raw, uint32 advance) external {
        vm.warp(block.timestamp + bound(advance, 1, 30 days));
        address user = users[seed % 3];
        uint256 action = seed / 3 % 4;
        (uint256 amount,, uint256 credit,,) = off.account(user);
        if (action == 0) {
            uint256 available = token.balanceOf(user);
            if (available > 0) {
                vm.prank(user);
                off.deposit(bound(raw, 1, available));
            }
        } else if (action == 1 && amount > 0) {
            vm.prank(user);
            off.withdraw(bound(raw, 1, amount));
        } else if (action == 2 && off.totalTokenSeconds() > 0) {
            uint256 value = bound(raw, 1 gwei, 10 ether);
            vm.deal(address(this), value);
            off.fund{value: value}();
        } else if (action == 3 && credit > 0) {
            vm.prank(user);
            off.claim(payable(user));
        }
    }
}

contract OfflineInvariant is StdInvariant, Test {
    Offline off;
    MockToken token;
    Handler handler;

    function setUp() public {
        MockHook hook = new MockHook();
        MockWeth weth = new MockWeth();
        off = new Offline(address(hook), address(weth), address(this));
        token = new MockToken(hook.factory(), address(this));
        hook.configure(address(token), address(weth), address(this), 30_000, false);
        off.bindToken(address(token));
        handler = new Handler(off, token);
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = Handler.step.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariantSolventAndAgeConserved() public view {
        uint256 principal;
        uint256 age;
        uint256 liabilities;
        for (uint256 i; i < 3; ++i) {
            (uint256 a, uint256 w, uint256 c,,) = off.account(handler.users(i));
            principal += a;
            age += w;
            liabilities += c;
        }
        assertEq(principal, off.totalDeposited());
        assertEq(age, off.totalTokenSeconds());
        assertLe(principal, token.balanceOf(address(off)));
        assertLe(liabilities, address(off).balance);
        assertEq(off.totalFunded() - off.totalClaimed(), address(off).balance);
    }
}
