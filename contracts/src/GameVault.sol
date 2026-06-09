// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title GameVault — on-chain custody for the off-chain game balance
/// @notice Players deposit tKRW into this contract (auditable, not a personal
///         wallet). They then play off-chain with no signatures; the server is
///         authoritative for balances. To cash out, the server (operator) signs
///         an EIP-712 voucher stating the player's *cumulative* withdrawable
///         amount, and anyone — typically a backend relayer so the player needs
///         no gas/signature — submits it. Funds can only ever leave to the named
///         player, and only up to operator-signed amounts.
///
/// @dev Trust model: this removes external-theft and gives transparent on-chain
///      deposits/withdrawals, but because settlement is off-chain the operator
///      is still trusted to sign correct balances. Full trustlessness needs
///      on-chain settlement / fraud proofs (state channels) — out of scope.
contract GameVault {
    IERC20 public immutable token;
    address public owner; // can rotate the operator
    address public operator; // signs withdrawal vouchers (backend hot key)

    mapping(address => uint256) public deposited; // lifetime deposits (analytics)
    mapping(address => uint256) public withdrawn; // lifetime withdrawn (replay guard + cumulative base)

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256("Withdraw(address user,uint256 cumulative)");

    event Deposited(address indexed user, uint256 amount, uint256 lifetime);
    event Withdrawn(address indexed user, uint256 amount, uint256 cumulative);
    event BankrollFunded(address indexed from, uint256 amount);
    event OperatorChanged(address indexed operator);

    constructor(address token_, address operator_) {
        require(token_ != address(0) && operator_ != address(0), "zero");
        token = IERC20(token_);
        owner = msg.sender;
        operator = operator_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("GameVault")),
                block.chainid,
                address(this)
            )
        );
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setOperator(address op) external onlyOwner {
        require(op != address(0), "zero");
        operator = op;
        emit OperatorChanged(op);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
    }

    /// Player deposits tKRW (approve this contract first).
    function deposit(uint256 amount) external {
        require(amount > 0, "zero");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        deposited[msg.sender] += amount;
        emit Deposited(msg.sender, amount, deposited[msg.sender]);
    }

    /// Top up the house bankroll so net winnings beyond deposits can be paid.
    function fundBankroll(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit BankrollFunded(msg.sender, amount);
    }

    /// Pay a player up to the operator-signed cumulative entitlement. Funds go
    /// only to `user`. Idempotent: re-submitting an old/equal cumulative pays 0.
    function withdraw(address user, uint256 cumulative, bytes calldata sig) external {
        require(_verify(user, cumulative, sig), "bad sig");
        uint256 already = withdrawn[user];
        require(cumulative > already, "nothing to withdraw");
        uint256 amount = cumulative - already;
        withdrawn[user] = cumulative;
        require(token.transfer(user, amount), "payout failed");
        emit Withdrawn(user, amount, cumulative);
    }

    function freeBankroll() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function _verify(address user, uint256 cumulative, bytes calldata sig) internal view returns (bool) {
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, user, cumulative));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        return _recover(digest, sig) == operator;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
