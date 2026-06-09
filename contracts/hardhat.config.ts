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
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
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
};

export default config;
