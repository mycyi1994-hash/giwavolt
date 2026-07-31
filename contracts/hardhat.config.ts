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
  networks: {
    hardhat: { blockGasLimit: 60_000_000 },
    giwaSepolia: {
      url: process.env.GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io",
      chainId: 91342,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // Source verification on Giwa's Blockscout. Deploying is not enough — an
  // unverified address shows bytecode only, so nobody can read what they are
  // depositing into, and the settings below have to match how it was compiled
  // (0.8.24, optimizer on, 200 runs) or verification is rejected.
  //
  //   npm run verify:testkrw
  //   npm run verify:vault
  //
  // Blockscout ignores the API key but hardhat-verify requires the field to be
  // non-empty, hence the placeholder.
  etherscan: {
    apiKey: { giwaSepolia: process.env.BLOCKSCOUT_API_KEY ?? "blockscout" },
    customChains: [
      {
        network: "giwaSepolia",
        chainId: 91342,
        urls: {
          apiURL: process.env.GIWA_EXPLORER_API ?? "https://sepolia-explorer.giwa.io/api",
          browserURL: process.env.GIWA_EXPLORER_URL ?? "https://sepolia-explorer.giwa.io",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};

export default config;
