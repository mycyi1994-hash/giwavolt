// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SlideGame — real-price multiplier-grid "tap trading" game
/// @notice Players tap cells of a grid laid over a *future* price path. The line
///         is the real BTC/ETH price posted by a trusted oracle. Every round
///         commits its multiplier grid BEFORE any price is known; a bet pays
///         `cell.multiplier x stake` when the actual price for that column lands
///         in the bet's price band (row). Funds are native GIWA ETH.
///
/// @dev Fairness model: the grid (multipliers + bands) is immutable once a round
///      opens and is therefore independent of the yet-unknown market price. The
///      price feed is the same oracle trust model as the prediction market; v2
///      can decentralise it (k-of-n / optimistic). See game/docs/design.md.
contract SlideGame {
    // --------------------------------------------------------------------- //
    //                                roles                                   //
    // --------------------------------------------------------------------- //
    address public admin; // opens rounds, sets params, withdraws free bankroll
    address public oracle; // posts the real price for each column
    address public treasury; // receives swept house profit

    // --------------------------------------------------------------------- //
    //                              constants                                 //
    // --------------------------------------------------------------------- //
    uint32 public constant BPS = 10_000; // 1x = 10000

    // outstanding potential payouts that the bankroll must always cover
    uint256 public lockedLiability;

    // --------------------------------------------------------------------- //
    //                               rounds                                   //
    // --------------------------------------------------------------------- //
    enum RoundStatus {
        None,
        Open,
        Closed
    }

    struct Round {
        string asset; // display label, e.g. "ETH/USD"
        uint128 startPrice; // P0 at open, in oracle units
        uint64 startTime; // unix seconds; column c samples at startTime + c*interval
        uint32 columnInterval; // seconds per column
        uint8 numColumns;
        uint8 numRows; // price bands; row 0 = lowest, numRows-1 = highest
        RoundStatus status;
    }

    mapping(uint256 => Round) public rounds;
    // roundId => ascending price thresholds, length numRows-1, defining numRows bands
    mapping(uint256 => uint128[]) private bandThresholds;
    // roundId => column => row => multiplier in bps (0 = cell not bettable)
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint32))) public multiplier;
    // roundId => column => sampled real price (0 until resolved)
    mapping(uint256 => mapping(uint8 => uint128)) public columnPrice;
    mapping(uint256 => mapping(uint8 => bool)) public columnResolved;
    mapping(uint256 => mapping(uint8 => uint8)) public winningRow; // valid when resolved

    uint256 public nextRoundId = 1;

    // --------------------------------------------------------------------- //
    //                                bets                                    //
    // --------------------------------------------------------------------- //
    struct Bet {
        address player;
        uint96 amount; // wei staked
        uint256 roundId;
        uint8 column;
        uint8 row;
        uint32 lockedMult; // multiplier locked at bet time (bps)
        bool settled;
    }

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId = 1;

    // betting guardrails
    uint96 public minBet = 0;
    uint96 public maxBet = type(uint96).max;

    // --------------------------------------------------------------------- //
    //                               events                                   //
    // --------------------------------------------------------------------- //
    event RoundOpened(
        uint256 indexed roundId,
        string asset,
        uint128 startPrice,
        uint64 startTime,
        uint32 columnInterval,
        uint8 numColumns,
        uint8 numRows
    );
    event RoundClosed(uint256 indexed roundId);
    event BetPlaced(
        uint256 indexed betId,
        uint256 indexed roundId,
        address indexed player,
        uint8 column,
        uint8 row,
        uint96 amount,
        uint32 multiplier
    );
    event ColumnResolved(uint256 indexed roundId, uint8 column, uint128 price, uint8 winningRow);
    event BetSettled(uint256 indexed betId, address indexed player, bool won, uint256 payout);
    event BankrollFunded(address indexed from, uint256 amount);
    event BankrollWithdrawn(address indexed to, uint256 amount);
    event RolesChanged(address admin, address oracle, address treasury);

    // --------------------------------------------------------------------- //
    //                              modifiers                                 //
    // --------------------------------------------------------------------- //
    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }
    modifier onlyOracle() {
        require(msg.sender == oracle, "not oracle");
        _;
    }

    constructor(address _admin, address _oracle, address _treasury) {
        admin = _admin == address(0) ? msg.sender : _admin;
        oracle = _oracle == address(0) ? msg.sender : _oracle;
        treasury = _treasury == address(0) ? msg.sender : _treasury;
        emit RolesChanged(admin, oracle, treasury);
    }

    // --------------------------------------------------------------------- //
    //                          bankroll management                          //
    // --------------------------------------------------------------------- //
    receive() external payable {
        emit BankrollFunded(msg.sender, msg.value);
    }

    function fundBankroll() external payable {
        emit BankrollFunded(msg.sender, msg.value);
    }

    /// @notice Bankroll not reserved against outstanding bets.
    function freeBankroll() public view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > lockedLiability ? bal - lockedLiability : 0;
    }

    function withdrawFree(uint256 amount, address to) external onlyAdmin {
        require(amount <= freeBankroll(), "exceeds free");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit BankrollWithdrawn(to, amount);
    }

    // --------------------------------------------------------------------- //
    //                          round administration                         //
    // --------------------------------------------------------------------- //

    /// @param thresholds ascending price thresholds (length numRows-1)
    /// @param mults flattened multipliers, row-major: mults[col*numRows + row], bps
    function openRound(
        string calldata asset,
        uint128 startPrice,
        uint64 startTime,
        uint32 columnInterval,
        uint8 numColumns,
        uint8 numRows,
        uint128[] calldata thresholds,
        uint32[] calldata mults
    ) external onlyAdmin returns (uint256 roundId) {
        require(numColumns > 0 && numRows > 1, "bad dims");
        require(columnInterval > 0, "bad interval");
        require(thresholds.length == uint256(numRows) - 1, "bad thresholds");
        require(mults.length == uint256(numColumns) * numRows, "bad mults");
        for (uint256 i = 1; i < thresholds.length; i++) {
            require(thresholds[i] > thresholds[i - 1], "thresholds not ascending");
        }

        roundId = nextRoundId++;
        rounds[roundId] = Round({
            asset: asset,
            startPrice: startPrice,
            startTime: startTime,
            columnInterval: columnInterval,
            numColumns: numColumns,
            numRows: numRows,
            status: RoundStatus.Open
        });
        bandThresholds[roundId] = thresholds;

        for (uint8 c = 0; c < numColumns; c++) {
            for (uint8 r = 0; r < numRows; r++) {
                uint32 m = mults[uint256(c) * numRows + r];
                if (m != 0) {
                    require(m > BPS, "mult <= 1x");
                    multiplier[roundId][c][r] = m;
                }
            }
        }

        emit RoundOpened(roundId, asset, startPrice, startTime, columnInterval, numColumns, numRows);
    }

    function closeRound(uint256 roundId) external onlyAdmin {
        require(rounds[roundId].status == RoundStatus.Open, "not open");
        rounds[roundId].status = RoundStatus.Closed;
        emit RoundClosed(roundId);
    }

    // --------------------------------------------------------------------- //
    //                                betting                                 //
    // --------------------------------------------------------------------- //

    /// @notice Tap a grid cell. Betting on column `c` closes when it is sampled
    ///         (startTime + c*interval). Reverts unless the bankroll can cover
    ///         the full potential payout.
    function placeBet(uint256 roundId, uint8 column, uint8 row) external payable returns (uint256 betId) {
        Round storage rnd = rounds[roundId];
        require(rnd.status == RoundStatus.Open, "round not open");
        require(column < rnd.numColumns && row < rnd.numRows, "out of grid");
        require(block.timestamp < columnTime(roundId, column), "column closed");

        uint32 mult = multiplier[roundId][column][row];
        require(mult > 0, "cell not bettable");

        uint256 amount = msg.value;
        require(amount >= minBet && amount <= maxBet, "bet out of range");

        uint256 payout = (amount * mult) / BPS;
        // balance already includes this msg.value, so compare against it directly
        require(lockedLiability + payout <= address(this).balance, "bankroll too low");
        lockedLiability += payout;

        betId = nextBetId++;
        bets[betId] = Bet({
            player: msg.sender,
            amount: uint96(amount),
            roundId: roundId,
            column: column,
            row: row,
            lockedMult: mult,
            settled: false
        });

        emit BetPlaced(betId, roundId, msg.sender, column, row, uint96(amount), mult);
    }

    // --------------------------------------------------------------------- //
    //                              resolution                                //
    // --------------------------------------------------------------------- //

    /// @notice Oracle posts the real price for a column once its sample time passed.
    function setColumnPrice(uint256 roundId, uint8 column, uint128 price) external onlyOracle {
        Round storage rnd = rounds[roundId];
        require(rnd.status != RoundStatus.None, "no round");
        require(column < rnd.numColumns, "bad column");
        require(!columnResolved[roundId][column], "already resolved");
        require(block.timestamp >= columnTime(roundId, column), "too early");

        uint8 wrow = _rowForPrice(roundId, price);
        columnPrice[roundId][column] = price;
        winningRow[roundId][column] = wrow;
        columnResolved[roundId][column] = true;

        emit ColumnResolved(roundId, column, price, wrow);
    }

    /// @notice Settle a bet after its column is resolved. Callable by anyone
    ///         (player or a keeper). Winners are paid `stake * multiplier`.
    function settleBet(uint256 betId) external {
        Bet storage b = bets[betId];
        require(b.player != address(0), "no bet");
        require(!b.settled, "already settled");
        require(columnResolved[b.roundId][b.column], "column not resolved");

        b.settled = true;
        uint256 payout = (uint256(b.amount) * b.lockedMult) / BPS;
        lockedLiability -= payout;

        bool won = winningRow[b.roundId][b.column] == b.row;
        if (won) {
            (bool ok, ) = b.player.call{value: payout}("");
            require(ok, "payout failed");
        }
        // on a loss the stake simply stays in the bankroll as house profit
        emit BetSettled(betId, b.player, won, won ? payout : 0);
    }

    // --------------------------------------------------------------------- //
    //                                 views                                  //
    // --------------------------------------------------------------------- //

    function columnTime(uint256 roundId, uint8 column) public view returns (uint64) {
        Round storage rnd = rounds[roundId];
        return rnd.startTime + uint64(column) * rnd.columnInterval;
    }

    function getThresholds(uint256 roundId) external view returns (uint128[] memory) {
        return bandThresholds[roundId];
    }

    /// @notice Full multiplier grid for a round, row-major: grid[col*numRows + row].
    function getGrid(uint256 roundId) external view returns (uint32[] memory grid) {
        Round storage rnd = rounds[roundId];
        grid = new uint32[](uint256(rnd.numColumns) * rnd.numRows);
        for (uint8 c = 0; c < rnd.numColumns; c++) {
            for (uint8 r = 0; r < rnd.numRows; r++) {
                grid[uint256(c) * rnd.numRows + r] = multiplier[roundId][c][r];
            }
        }
    }

    function _rowForPrice(uint256 roundId, uint128 price) internal view returns (uint8) {
        uint128[] storage t = bandThresholds[roundId];
        for (uint256 i = 0; i < t.length; i++) {
            if (price < t[i]) return uint8(i);
        }
        return uint8(t.length); // top band
    }

    // --------------------------------------------------------------------- //
    //                            admin settings                              //
    // --------------------------------------------------------------------- //
    function setRoles(address _admin, address _oracle, address _treasury) external onlyAdmin {
        if (_admin != address(0)) admin = _admin;
        if (_oracle != address(0)) oracle = _oracle;
        if (_treasury != address(0)) treasury = _treasury;
        emit RolesChanged(admin, oracle, treasury);
    }

    function setBetLimits(uint96 _minBet, uint96 _maxBet) external onlyAdmin {
        require(_maxBet >= _minBet, "bad limits");
        minBet = _minBet;
        maxBet = _maxBet;
    }
}
