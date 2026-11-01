// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployScriptTest is Test {
    function testScriptRefusesWrongNetworkBeforeBroadcast() public {
        Deploy script = new Deploy();
        vm.chainId(97);
        vm.expectRevert("Ethereum mainnet only");
        script.run();
    }
}
