// Is REAL mode available in this deployment?
//
// REAL needs a configured backend: a Postgres ledger, a faucet key, a token
// address. The browser cannot see whether any of that is set — those are
// server-only, which is correct — so a deployment has to declare it.
//
// Default is OFF, deliberately. A public DEMO deployment with no DATABASE_URL
// would otherwise let a visitor switch to REAL, connect a wallet, and get a
// 500 out of the first ledger call, because getSql() throws "DATABASE_URL is
// not set". Opting in is one variable; shipping a broken button is silent.
export const REAL_ENABLED = process.env.NEXT_PUBLIC_REAL_MODE === "on";
