// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TestKRW (tKRW) — play-money ERC-20 for the VOLT testnet build
/// @notice A faucet-funded test token denominated like KRW. There is no real
///         value here; it exists so people can try the games on Giwa Sepolia
///         without needing real testnet USDC. Anyone can pull a fixed drip from
///         the public `faucet()` (rate-limited); the server-side faucet uses the
///         owner's `mint()` to push tokens (plus a little gas ETH) to wallets
///         that have zero ETH and therefore cannot transact yet.
contract TestKRW {
    string public constant name = "Test KRW";
    string public constant symbol = "tKRW";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;

    // public faucet drip
    uint256 public constant FAUCET_AMOUNT = 1_000_000e18; // 1,000,000 tKRW
    uint256 public constant FAUCET_COOLDOWN = 8 hours;
    mapping(address => uint256) public lastFaucet;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Faucet(address indexed to, uint256 amount);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    // ----- ERC-20 -----
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "transfer to zero");
        uint256 bal = balanceOf[from];
        require(bal >= value, "insufficient balance");
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    // ----- minting -----
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "mint to zero");
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }

    // ----- public faucet (for wallets that already have gas) -----
    function faucet() external {
        require(block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN, "faucet cooldown");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }
}
