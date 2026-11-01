// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {Offline} from "../src/Offline.sol";

contract Deploy is Script {
    function run() external returns (Offline offline) {
        string memory json = vm.readFile(vm.envOr("DM_CONFIG", string("config.json")));
        address creator = vm.parseJsonAddress(json, ".admin");
        address hook = vm.parseJsonAddress(json, ".stockereum.hook");
        address weth = vm.parseJsonAddress(json, ".weth");
        require(vm.parseJsonAddress(json, ".token") == address(0), "launch last; token must be zero");
        uint256 startBlock = block.number;
        vm.startBroadcast();
        offline = new Offline(hook, weth, creator);
        vm.stopBroadcast();
        string memory o = "dm";
        vm.serializeString(o, "protocol", "dm-offline-v1");
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", startBlock);
        vm.serializeAddress(o, "admin", creator);
        string memory output = vm.serializeAddress(o, "offline", address(offline));
        vm.writeJson(
            output,
            string.concat(vm.envOr("DM_DEPLOYMENTS", string("deployments")), "/", vm.toString(block.chainid), ".json")
        );
        console2.log("DM Offline", address(offline));
    }
}
