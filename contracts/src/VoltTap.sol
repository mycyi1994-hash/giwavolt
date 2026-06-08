// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VoltTap {
    uint256 public constant STAKE = 1e14;     // 0.0001 ETH, fixed
    uint16  public constant BPS = 10_000;
    uint16  public constant EDGE_BPS = 700;   // 7% house edge
    address public owner;
    uint256 public nonce;

    event Tapped(address indexed player, uint16 winChanceBps, uint256 multiplierBps, uint256 payout, bool win, uint256 roll);
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() { owner = msg.sender; }

    // win-chance p = winChanceBps/BPS; multiplier = (BPS-EDGE_BPS)/winChanceBps; payout = STAKE*multiplier
    function tap(uint16 winChanceBps) external payable returns (bool win, uint256 payout) {
        require(msg.value == STAKE, "stake must be 0.0001 ETH");
        require(winChanceBps > 0 && winChanceBps < BPS, "bad winChance");
        payout = (msg.value * (BPS - EDGE_BPS)) / winChanceBps;     // includes the stake
        require(address(this).balance >= payout, "bankroll too low"); // balance already includes this stake
        uint256 roll = uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), msg.sender, nonce++))) % BPS;
        win = roll < winChanceBps;
        uint256 multBps = (uint256(BPS - EDGE_BPS) * BPS) / winChanceBps;
        if (win) { (bool ok, ) = msg.sender.call{value: payout}(""); require(ok, "payout failed"); }
        emit Tapped(msg.sender, winChanceBps, multBps, win ? payout : 0, win, roll);
    }

    function fund() external payable { emit Funded(msg.sender, msg.value); }
    receive() external payable { emit Funded(msg.sender, msg.value); }

    function freeBankroll() external view returns (uint256) { return address(this).balance; }

    function withdraw(uint256 amount, address to) external {
        require(msg.sender == owner, "not owner");
        (bool ok, ) = to.call{value: amount}(""); require(ok, "withdraw failed");
        emit Withdrawn(to, amount);
    }
}
