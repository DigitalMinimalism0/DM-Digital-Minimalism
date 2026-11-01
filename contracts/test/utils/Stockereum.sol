// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Minimal interfaces to the real, deployed Stockereum v3 contracts (verified source on Sourcify).

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct LaunchParams {
    string name;
    string symbol;
    string metadataUri;
    address quote;
    uint256 quoteUsdPrice;
    uint256 priceDeadline;
    bytes priceSignature;
    uint24 feePpm;
    bool feesToHolders;
}

interface IFactory {
    function owner() external view returns (address);
    function setPriceSigner(address signer) external;
    function creationFee() external view returns (uint256);
    function weth() external view returns (address);
    function createLaunch(LaunchParams calldata p)
        external
        payable
        returns (address token, PoolKey memory key, bytes32 poolId);
}

interface IRouter {
    function buyWethPairWithEth(PoolKey calldata key, uint256 minOut, bytes calldata hookData)
        external
        payable
        returns (uint256);
    function sellWethPairForEth(
        PoolKey calldata key,
        address token,
        uint256 amountIn,
        uint256 minOut,
        bytes calldata hookData
    ) external returns (uint256);
}

interface IHook {
    function escrow() external view returns (address);
    function currentFee(bytes32 poolId) external view returns (uint256);
}

interface IEscrow {
    function claimable(address account, address currency) external view returns (uint256);
    function claim(address currency, address to) external returns (uint256);
}

interface ILaunchToken {
    function creator() external view returns (address);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

library Stockereum {
    address internal constant FACTORY = 0xc6B080DEd03C3382476A76345e79f82BD480977B;
    address internal constant HOOK = 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC;
    address internal constant ROUTER = 0xcdf832D2C11DA16055bb6C6145cF38EDD7233767;
    address internal constant ESCROW = 0xAcefe251da006887dA41C063D06CC82A060824BA;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    bytes32 internal constant PRICE_TYPEHASH = keccak256("QuotePrice(address quote,uint256 usdPrice,uint256 deadline)");

    /// @dev EIP-712 digest the factory checks against its price signer (domain "StockpadLaunchFactory", "1").
    function priceDigest(uint256 usdPrice, uint256 deadline) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StockpadLaunchFactory"),
                keccak256("1"),
                block.chainid,
                FACTORY
            )
        );
        bytes32 structHash = keccak256(abi.encode(PRICE_TYPEHASH, WETH, usdPrice, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }
}
