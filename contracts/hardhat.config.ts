import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

// Use the locally installed solc package so we don't need network access to
// download the compiler at compile time.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: any, _hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: "0.8.24+commit.e11b9ed9",
    };
  }
  return runSuper(args);
});

const config: HardhatUserConfig = {
  // Compiler settings are overridable by env so a contract deployed elsewhere —
  // Remix, say — can still be verified against this source. Verification
  // recompiles and compares bytecode, so it has to reproduce the settings the
  // deployment actually used, not the ones we prefer. Defaults are unchanged.
  //
  // A quick tell for EVM version: bytecode containing 5f (PUSH0) was compiled
  // for shanghai or later; paris output uses 6000 (PUSH1 0) instead.
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: process.env.SOLC_OPTIMIZER !== "false",
        runs: Number(process.env.SOLC_OPTIMIZER_RUNS ?? 200),
      },
      evmVersion: process.env.SOLC_EVM_VERSION ?? "paris",
      viaIR: false,
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // The chains these contracts can be deployed to. Pick one per command with
  // NETWORK, which every deploy/verify script in package.json reads:
  //
  //   NETWORK=bscTestnet npm run deploy:testkrw
  //
  // Unset means giwaSepolia, which is where the pair recorded in
  // DEPLOYMENTS.md already lives. Keep the keys here in step with the registry
  // in web/lib/chain.ts — the app and the deployment have to name the same
  // chain or the vault rejects every withdrawal voucher as "bad sig".
  networks: {
    hardhat: { blockGasLimit: 60_000_000 },
    giwaSepolia: {
      url: process.env.GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io",
      chainId: 91342,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    opbnbTestnet: {
      url: process.env.OPBNB_TESTNET_RPC_URL ?? "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // Source verification. Deploying is not enough — an unverified address shows
  // bytecode only, so nobody can read what they are depositing into, and the
  // settings above have to match how it was compiled (0.8.24, optimizer on,
  // 200 runs) or verification is rejected.
  //
  //   NETWORK=bscTestnet npm run verify:testkrw
  //   NETWORK=bscTestnet npm run verify:vault
  //
  // Blockscout ignores the API key but hardhat-verify requires the field to be
  // non-empty, hence the placeholder. The BscScan-family explorers do NOT
  // ignore it: verifying on BSC or opBNB needs a real key from bscscan.com in
  // BSCSCAN_API_KEY, or the request comes back rejected rather than unverified,
  // which is easy to misread as a compiler-settings mismatch.
  etherscan: {
    apiKey: {
      giwaSepolia: process.env.BLOCKSCOUT_API_KEY ?? "blockscout",
      bscTestnet: process.env.BSCSCAN_API_KEY ?? "",
      opbnbTestnet: process.env.BSCSCAN_API_KEY ?? "",
    },
    customChains: [
      {
        network: "giwaSepolia",
        chainId: 91342,
        urls: {
          apiURL: process.env.GIWA_EXPLORER_API ?? "https://sepolia-explorer.giwa.io/api",
          browserURL: process.env.GIWA_EXPLORER_URL ?? "https://sepolia-explorer.giwa.io",
        },
      },
      // bscTestnet is one hardhat-verify already knows, but naming it here
      // keeps the endpoint overridable alongside the others.
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: process.env.BSC_TESTNET_EXPLORER_API ?? "https://api-testnet.bscscan.com/api",
          browserURL: process.env.BSC_TESTNET_EXPLORER_URL ?? "https://testnet.bscscan.com",
        },
      },
      {
        network: "opbnbTestnet",
        chainId: 5611,
        urls: {
          apiURL: process.env.OPBNB_TESTNET_EXPLORER_API ?? "https://api-opbnb-testnet.bscscan.com/api",
          browserURL: process.env.OPBNB_TESTNET_EXPLORER_URL ?? "https://testnet.opbnbscan.com",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};

export default config;
