// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {Test} from "forge-std/Test.sol";
import {Offline} from "../../src/Offline.sol";
import {PoolKey, LaunchParams, IFactory, IRouter, IEscrow, ILaunchToken, Stockereum} from "../utils/Stockereum.sol";

interface IWethFork {
    function withdraw(uint256) external;
}

/// @notice Mainnet state, local fork writes ONLY. Never broadcasts.
contract StockereumForkTest is Test {
    function testLaunchLastBindTradeClaimFundAndExit() public {
        vm.createSelectFork(vm.envOr("MAINNET_RPC_URL", string("https://ethereum-rpc.publicnode.com")));
        address creator = makeAddr("dm-creator");
        address user = makeAddr("dm-user");
        vm.deal(creator, 10 ether);
        vm.deal(user, 10 ether);
        Offline off = new Offline(Stockereum.HOOK, Stockereum.WETH, creator);
        IFactory factory = IFactory(Stockereum.FACTORY);
        PoolKey memory key;
        address t;
        {
            (address signer, uint256 signingKey) = makeAddrAndKey("fork-only-price-signer");
            vm.prank(factory.owner());
            factory.setPriceSigner(signer);
            uint256 deadline = block.timestamp + 300;
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey, Stockereum.priceDigest(3000e18, deadline));
            LaunchParams memory params = LaunchParams({
                name: "DM Fork Rehearsal",
                symbol: "DM",
                metadataUri: "",
                quote: Stockereum.WETH,
                quoteUsdPrice: 3000e18,
                priceDeadline: deadline,
                priceSignature: abi.encodePacked(r, s, v),
                feePpm: 30_000,
                feesToHolders: false
            });
            uint256 fee = factory.creationFee();
            vm.prank(creator);
            (t, key,) = factory.createLaunch{value: fee}(params);
        }
        vm.prank(creator);
        off.bindToken(t);
        assertEq(address(off.token()), t);
        vm.warp(block.timestamp + 21);
        vm.prank(user);
        uint256 amount = IRouter(Stockereum.ROUTER).buyWethPairWithEth{value: 0.1 ether}(key, 0, "");
        assertGt(amount, 0);
        ILaunchToken token = ILaunchToken(t);
        vm.startPrank(user);
        token.approve(address(off), amount);
        off.deposit(amount);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days);
        uint256 claimable = IEscrow(Stockereum.ESCROW).claimable(creator, Stockereum.WETH);
        assertGt(claimable, 0);
        vm.startPrank(creator);
        IEscrow(Stockereum.ESCROW).claim(Stockereum.WETH, creator);
        IWethFork(Stockereum.WETH).withdraw(claimable);
        off.fund{value: claimable}();
        vm.stopPrank();
        (,, uint256 earned,,) = off.account(user);
        assertApproxEqAbs(earned, claimable, 1);
        vm.prank(user);
        off.withdraw(amount);
        assertEq(token.balanceOf(user), amount);
        vm.prank(user);
        off.claim(payable(user));
        assertEq(off.totalClaimed(), earned);
        assertEq(off.totalDeposited(), 0);
    }
}
