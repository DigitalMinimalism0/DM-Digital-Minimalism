// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {OfflineFixture} from "./Offline.t.sol";

/// @notice O(users * fundings) oracle: explicitly age and allocate every account at every event.
/// It does not use the contract's two-index integration or checkpoint implementation.
contract ReferenceModelTest is OfflineFixture {
    uint256 constant N = 7;
    uint256 constant P = 1e36;
    address[N] users;
    uint256[N] principal;
    uint256[N] age;
    uint256[N] scaledCredit;
    uint256[N] collected;
    uint256 funded;
    uint256 donations;

    function setUp() public override {
        super.setUp();
        for (uint256 i; i < N; i++) {
            users[i] = address(uint160(0x1000 + i));
            token.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            token.approve(address(off), type(uint256).max);
        }
        vm.deal(address(this), 1_000_000 ether);
    }

    /// forge-config: default.fuzz.runs = 1000
    /// forge-config: ci.fuzz.runs = 1000
    function testFuzzAgainstExplicitPerFundingModel(bytes32 seed) public {
        for (uint256 step; step < 96; step++) {
            seed = keccak256(abi.encode(seed, step));
            uint256 r = uint256(seed);
            uint256 dt = (r >> 32) % (90 days + 1);
            if (step % 5 == 0) dt = 0; // same-block reorderings, including claims and full exits
            vm.warp(block.timestamp + dt);
            uint256 totalAge;
            for (uint256 j; j < N; j++) {
                age[j] += principal[j] * dt;
                totalAge += age[j];
            }
            uint256 i = r % N;
            uint256 action = (r >> 8) % 7;
            if (action == 0) {
                uint256 available = token.balanceOf(users[i]);
                if (available > 0) {
                    uint256 amount = 1 + (r >> 64) % available;
                    vm.prank(users[i]);
                    off.deposit(amount);
                    principal[i] += amount;
                }
            } else if (action == 1 && principal[i] > 0) {
                uint256 amount = step % 3 == 0 ? principal[i] : 1 + (r >> 64) % principal[i];
                age[i] -= age[i] * amount / principal[i];
                principal[i] -= amount;
                vm.prank(users[i]);
                off.withdraw(amount);
            } else if ((action == 2 || action == 5) && totalAge > 0) {
                uint256 value = 1 + (r >> 64) % (100 ether);
                if (step % 7 == 0) value = 1;
                uint256 increment = value * P / totalAge;
                if (increment > 0) {
                    if (action == 5) {
                        weth.deposit{value: value}();
                        weth.transfer(address(off), value);
                        vm.prank(users[(i + 1) % N]);
                        off.fundWeth();
                    } else {
                        off.fund{value: value}();
                    }
                    for (uint256 j; j < N; j++) {
                        scaledCredit[j] += age[j] * increment;
                    }
                    funded += value;
                }
            } else if (action == 3 && scaledCredit[i] / P > 0) {
                uint256 value = scaledCredit[i] / P;
                scaledCredit[i] %= P;
                collected[i] += value;
                vm.prank(users[i]);
                off.claim(payable(users[(i + 1) % N]));
            } else if (action == 4) {
                // A token donation must not buy a position or perturb age.
                uint256 available = token.balanceOf(users[i]);
                if (available > 0) {
                    uint256 value = 1 + (r >> 64) % available;
                    vm.prank(users[i]);
                    token.transfer(address(off), value);
                    donations += value;
                }
            } else if (action == 6) {
                off.setDepositsPaused(true);
                off.setDepositsPaused(false);
            }
            _assertModel();
        }
        // Final unwind proves every principal and settled reward remains withdrawable.
        for (uint256 i; i < N; i++) {
            if (principal[i] > 0) {
                vm.prank(users[i]);
                off.withdraw(principal[i]);
                principal[i] = 0;
                age[i] = 0;
            }
            if (scaledCredit[i] / P > 0) {
                uint256 value = scaledCredit[i] / P;
                collected[i] += value;
                scaledCredit[i] %= P;
                vm.prank(users[i]);
                off.claim(payable(users[i]));
            }
        }
        _assertModel();
    }

    function _assertModel() internal view {
        uint256 totalPrincipal;
        uint256 totalAge;
        uint256 claimed;
        uint256 liabilities;
        for (uint256 i; i < N; i++) {
            (uint256 a, uint256 w, uint256 c, uint256 paid,) = off.account(users[i]);
            assertEq(a, principal[i], "model principal");
            assertEq(w, age[i], "model age");
            assertEq(c, scaledCredit[i] / P, "model rewards");
            assertEq(paid, collected[i], "model claimed");
            totalPrincipal += a;
            totalAge += w;
            claimed += paid;
            liabilities += c;
        }
        assertEq(off.totalDeposited(), totalPrincipal);
        assertEq(off.totalTokenSeconds(), totalAge);
        assertEq(token.balanceOf(address(off)), totalPrincipal + donations);
        assertEq(off.totalFunded(), funded);
        assertEq(off.totalClaimed(), claimed);
        assertEq(address(off).balance, funded - claimed);
        assertLe(liabilities, address(off).balance);
    }
}
