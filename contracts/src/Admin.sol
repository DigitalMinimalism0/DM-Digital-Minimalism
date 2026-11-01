// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Two-step admin with guarded renounce. The admin role only gates switches defined by the inheriting
///         contract; it never controls funds.
abstract contract Admin {
    address public admin;
    address public pendingAdmin;

    event AdminTransferStarted(address indexed admin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error NotAdmin();
    error NotPendingAdmin();
    error CannotRenounce();
    error ZeroAddress();

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminTransferred(address(0), admin_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Propose a new admin. Passing address(0) cancels a pending proposal.
    function transferAdmin(address newAdmin) external onlyAdmin {
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(msg.sender, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin || msg.sender == address(0)) revert NotPendingAdmin();
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// @notice Give up the admin role forever. Refused while a pause is active, so nothing can stay paused forever.
    function renounceAdmin() external onlyAdmin {
        if (!_canRenounce()) revert CannotRenounce();
        emit AdminTransferred(msg.sender, address(0));
        admin = address(0);
        pendingAdmin = address(0);
    }

    function _canRenounce() internal view virtual returns (bool);
}
