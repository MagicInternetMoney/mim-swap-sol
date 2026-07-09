#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

CP_PROGRAM_ID="$(sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' programs/cp-swap/src/lib.rs | head -n 1)"
MANA_PROGRAM_ID="$(sed -n 's/declare_id!("\([^"]*\)").*/\1/p' programs/mana-treasury/src/lib.rs | head -n 1)"
ADMIN_KEYPAIR="${ADMIN_KEYPAIR:-target/deploy/mim_admin-keypair.json}"
FEE_RECEIVER_KEYPAIR="${FEE_RECEIVER_KEYPAIR:-target/deploy/create_pool_fee_receiver-keypair.json}"
RPC_PORT="${FEE_SWEEP_TEST_RPC_PORT:-8899}"
RPC_URL="http://127.0.0.1:${RPC_PORT}"
LEDGER_DIR="${ROOT_DIR}/.anchor/fee-sweep-test-ledger"
LOG_FILE="${ROOT_DIR}/.anchor/fee-sweep-test-validator.log"
VALIDATOR_PID=""

cleanup() {
  if [[ -n "${VALIDATOR_PID}" ]] && kill -0 "${VALIDATOR_PID}" >/dev/null 2>&1; then
    kill "${VALIDATOR_PID}" >/dev/null 2>&1 || true
    wait "${VALIDATOR_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ ! -f "${ADMIN_KEYPAIR}" || ! -f "${FEE_RECEIVER_KEYPAIR}" ]]; then
  echo "Missing local keypairs. Run: npm run keys:setup" >&2
  exit 1
fi

if [[ ! -x "${ROOT_DIR}/node_modules/.bin/ts-mocha" ]]; then
  echo "Installing JavaScript test dependencies..."
  yarn install
fi

ADMIN_PUBKEY="$(solana-keygen pubkey "${ADMIN_KEYPAIR}")"

echo "Building mana_treasury with local-testing enabled..."
NO_DNA=1 anchor build -p mana_treasury -- --features local-testing

echo "Building raydium_cp_swap..."
NO_DNA=1 anchor build -p raydium_cp_swap

mkdir -p "${ROOT_DIR}/.anchor"

echo "Starting local validator on ${RPC_URL}..."
solana-test-validator \
  --reset \
  --quiet \
  --ledger "${LEDGER_DIR}" \
  --rpc-port "${RPC_PORT}" \
  --mint "${ADMIN_PUBKEY}" \
  --bpf-program "${MANA_PROGRAM_ID}" "${ROOT_DIR}/target/deploy/mana_treasury.so" \
  --bpf-program "${CP_PROGRAM_ID}" "${ROOT_DIR}/target/deploy/raydium_cp_swap.so" \
  >"${LOG_FILE}" 2>&1 &
VALIDATOR_PID="$!"

echo "Waiting for local validator..."
for _ in $(seq 1 60); do
  if solana --url "${RPC_URL}" cluster-version >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "${VALIDATOR_PID}" >/dev/null 2>&1; then
    echo "Local validator exited early. Last log lines:"
    tail -n 120 "${LOG_FILE}" || true
    exit 1
  fi

  sleep 1
done

if ! solana --url "${RPC_URL}" cluster-version >/dev/null 2>&1; then
  echo "Local validator did not become ready. Last log lines:"
  tail -n 120 "${LOG_FILE}" || true
  exit 1
fi

echo "Running permissionless treasury fee sweep integration test..."
ANCHOR_PROVIDER_URL="${RPC_URL}" \
ANCHOR_WALLET="${ADMIN_KEYPAIR}" \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/fee_sweep.integration.ts
