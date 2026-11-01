// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IBindingToken {
    function factory() external view returns (address);
    function creator() external view returns (address);
    function totalSupply() external view returns (uint256);
    function distributor() external view returns (address);
}

interface IBindingHook {
    struct Launch {
        address token;
        address feeRecipient;
        address quote;
        uint40 openedAt;
        uint24 feePpm;
        bool quoteIsCurrency0;
        bool pendingDevBuy;
        bool feesToHolders;
        address devBuyer;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }
    function factory() external view returns (address);
    function getLaunch(bytes32 poolId) external view returns (Launch memory);
}
