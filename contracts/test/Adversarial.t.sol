// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {OfflineFixture, MockToken, MockHook, MockWeth} from "./Offline.t.sol";
import {Offline} from "../src/Offline.sol";
import {Admin} from "../src/Admin.sol";
import {IERC20, SafeToken} from "../src/SafeToken.sol";

contract ReenteringRecipient {
    Offline public immutable off;
    uint256 public attempts;

    constructor(Offline o) {
        off = o;
    }

    receive() external payable {
        bytes[] memory calls = new bytes[](5);
        calls[0] = abi.encodeCall(off.claim, (payable(address(this))));
        calls[1] = abi.encodeCall(off.withdraw, (1));
        calls[2] = abi.encodeCall(off.deposit, (1));
        calls[3] = abi.encodeCall(off.fund, ());
        calls[4] = abi.encodeCall(off.fundWeth, ());
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory reason) = address(off).call(calls[i]);
            require(!ok && bytes4(reason) == Offline.Reentrancy.selector, "guard bypassed");
            attempts++;
        }
        (bool accepted, bytes memory why) = address(off).call("");
        require(!accepted && bytes4(why) == Offline.Reentrancy.selector, "receive reentry");
        attempts++;
    }
}

contract HostileToken is MockToken {
    Offline public off;
    bool public fee;
    bool public callback;
    constructor(address f, address c) MockToken(f, c) {}

    function configure(Offline o, bool f, bool c) external {
        off = o;
        fee = f;
        callback = c;
    }

    function _attack() internal {
        if (!callback) return;
        (bool ok, bytes memory reason) = address(off).call(abi.encodeCall(off.withdraw, (1)));
        require(!ok && bytes4(reason) == Offline.Reentrancy.selector, "token reentry");
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _attack();
        super.transferFrom(from, to, amount);
        if (fee) balanceOf[to]--;
        return true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _attack();
        return super.transfer(to, amount);
    }
}

contract ForceEther {
    constructor(address payable to) payable {
        selfdestruct(to);
    }
}

contract TokenHarness {
    using SafeToken for IERC20;

    function send(address t) external {
        IERC20(t).safeTransfer(address(123), 1);
    }
}

contract ReturnToken {
    uint256 public mode;

    constructor(uint256 m) {
        mode = m;
    }

    fallback() external {
        uint256 m = mode;
        assembly {
            switch m
            case 0 { return(0, 0) }
            case 1 {
                mstore(0, 1)
                return(0, 32)
            }
            case 2 {
                mstore(0, 0)
                return(0, 32)
            }
            case 3 {
                mstore(0, 2)
                return(0, 32)
            }
            case 4 { revert(0, 0) }
            default { return(0, 1) }
        }
    }
}

contract AdversarialTest is OfflineFixture {
    function testClaimCallbackCannotReenterAnyMoneyPath() public {
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1 days);
        off.fund{value: 1 ether}();
        uint256 credit = earned(alice);
        ReenteringRecipient recipient = new ReenteringRecipient(off);
        vm.prank(alice);
        off.claim(payable(address(recipient)));
        assertEq(recipient.attempts(), 6);
        assertEq(address(recipient).balance, credit);
        assertEq(earned(alice), 0);
        assertEq(off.totalClaimed(), credit);
        vm.prank(alice);
        off.withdraw(100e18);
        assertEq(off.totalDeposited(), 0);
    }

    function testTokenCallbacksAndFailedDepositsAreAtomic() public {
        HostileToken hostile = new HostileToken(hook.factory(), address(this));
        Offline fresh = new Offline(address(hook), address(weth), address(this));
        hook.configure(address(hostile), address(weth), address(this), 30_000, false);
        fresh.bindToken(address(hostile));
        hostile.mint(alice, 100e18);
        vm.prank(alice);
        hostile.approve(address(fresh), type(uint256).max);
        hostile.configure(fresh, true, true);
        vm.prank(alice);
        vm.expectRevert(Offline.TransferMismatch.selector);
        fresh.deposit(100e18);
        assertEq(fresh.totalDeposited(), 0);
        assertEq(fresh.participantCount(), 0);
        assertEq(hostile.balanceOf(alice), 100e18);
        hostile.configure(fresh, false, true);
        vm.prank(alice);
        fresh.deposit(100e18);
        vm.prank(alice);
        fresh.withdraw(100e18);
        assertEq(hostile.balanceOf(alice), 100e18);
    }

    function testAdminTransferCancellationAndRenounceCannotTrapFunds() public {
        vm.prank(alice);
        vm.expectRevert(Admin.NotAdmin.selector);
        off.setDepositsPaused(true);
        vm.prank(alice);
        vm.expectRevert(Admin.NotAdmin.selector);
        off.bindToken(address(token));
        off.transferAdmin(alice);
        vm.prank(bob);
        vm.expectRevert(Admin.NotPendingAdmin.selector);
        off.acceptAdmin();
        off.transferAdmin(address(0));
        vm.prank(alice);
        vm.expectRevert(Admin.NotPendingAdmin.selector);
        off.acceptAdmin();
        off.transferAdmin(alice);
        vm.prank(alice);
        off.acceptAdmin();
        assertEq(off.expectedCreator(), address(this));
        vm.expectRevert(Admin.NotAdmin.selector);
        off.setDepositsPaused(true);
        deposit(bob, 100e18);
        vm.warp(block.timestamp + 1);
        off.fund{value: 1 ether}();
        vm.prank(alice);
        off.setDepositsPaused(true);
        vm.prank(alice);
        vm.expectRevert(Admin.CannotRenounce.selector);
        off.renounceAdmin();
        vm.prank(bob);
        vm.expectRevert(Offline.DepositsPaused.selector);
        off.deposit(1);
        vm.prank(bob);
        off.withdraw(100e18);
        vm.prank(bob);
        off.claim(payable(bob));
        vm.prank(alice);
        off.setDepositsPaused(false);
        vm.prank(alice);
        off.renounceAdmin();
        assertEq(off.admin(), address(0));
        assertEq(off.pendingAdmin(), address(0));
        deposit(bob, 100e18);
        vm.prank(bob);
        off.withdraw(100e18);
    }

    function testUnboundRenounceAndWrongConstructorRejected() public {
        Offline fresh = new Offline(address(hook), address(weth), address(this));
        vm.expectRevert(Admin.CannotRenounce.selector);
        fresh.renounceAdmin();
        vm.expectRevert(Offline.NotBound.selector);
        fresh.deposit(1);
        vm.expectRevert(Offline.NotBound.selector);
        fresh.fund{value: 1}();
        vm.expectRevert(Offline.InvalidLaunch.selector);
        new Offline(alice, address(weth), address(this));
        vm.expectRevert(Offline.InvalidLaunch.selector);
        new Offline(address(hook), alice, address(this));
        vm.expectRevert(Admin.ZeroAddress.selector);
        new Offline(address(hook), address(weth), address(0));
    }

    function testBindingRejectsWrongCreatorQuoteFactoryHolderRewardsAndRecipient() public {
        Offline fresh = new Offline(address(hook), address(weth), address(this));
        MockToken wrongFactory = new MockToken(alice, address(this));
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(wrongFactory));
        MockToken wrongCreator = new MockToken(hook.factory(), alice);
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(wrongCreator));
        hook.configure(address(token), alice, address(this), 30_000, false);
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(token));
        hook.configure(address(token), address(weth), alice, 30_000, false);
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(token));
        hook.configure(address(token), address(weth), address(this), 30_000, true);
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(token));
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(address(weth));
        vm.expectRevert(Offline.InvalidLaunch.selector);
        fresh.bindToken(alice);
        hook.configure(address(token), address(weth), address(this), 30_000, false);
        fresh.bindToken(address(token));
    }

    function testWethUnwrapRollbackWithoutAgeThenPermissionlessFunding() public {
        weth.deposit{value: 2 ether}();
        weth.transfer(address(off), 2 ether);
        vm.expectRevert(Offline.NoEligibleDeposits.selector);
        off.fundWeth();
        assertEq(weth.balanceOf(address(off)), 2 ether);
        assertEq(address(off).balance, 0);
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        off.fundWeth();
        assertEq(off.totalFunded(), 2 ether);
        assertEq(earned(alice), 2 ether);
    }

    function testDonationsDoNotMintPositionsOrChangeRewardLiabilities() public {
        vm.prank(alice);
        token.transfer(address(off), 10e18);
        new ForceEther{value: 3 ether}(payable(address(off)));
        assertEq(off.totalFunded(), 0);
        assertEq(off.totalDeposited(), 0);
        deposit(alice, 100e18);
        vm.warp(block.timestamp + 1);
        (bool ok,) = address(off).call{value: 1 ether}("");
        assertTrue(ok);
        vm.prank(alice);
        off.withdraw(100e18);
        vm.prank(alice);
        off.claim(payable(alice));
        assertEq(address(off).balance, 3 ether);
        assertEq(token.balanceOf(address(off)), 10e18);
    }

    function testSafeTokenReturnValueVariants() public {
        TokenHarness harness = new TokenHarness();
        harness.send(address(new ReturnToken(0)));
        harness.send(address(new ReturnToken(1)));
        for (uint256 i = 2; i < 6; i++) {
            ReturnToken bad = new ReturnToken(i);
            vm.expectRevert();
            harness.send(address(bad));
        }
        vm.expectRevert(SafeToken.TransferFailed.selector);
        harness.send(alice);
    }

    function testDustOneWeiAndMaximumSupplyLongLifetime() public {
        uint256 supply = off.LAUNCH_SUPPLY();
        token.mint(alice, supply - 1_000_000e18);
        deposit(alice, supply);
        vm.warp(block.timestamp + 100 * 365 days);
        vm.expectRevert(Offline.FundingTooSmall.selector);
        off.fund{value: 1}();
        off.fund{value: 100 ether}();
        assertApproxEqAbs(earned(alice), 100 ether, 3154);
        vm.prank(alice);
        off.withdraw(supply - 1);
        vm.warp(block.timestamp + 100 * 365 days);
        off.fund{value: 100 ether}();
        vm.prank(alice);
        off.withdraw(1);
        vm.prank(alice);
        off.claim(payable(alice));
        assertEq(off.totalDeposited(), 0);
        assertEq(off.totalTokenSeconds(), 0);
        assertLe(address(off).balance, 3154);
    }
}
