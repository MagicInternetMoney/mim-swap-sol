#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROGRAM_ID="$(sed -n 's/declare_id!("\([^"]*\)").*/\1/p' programs/mana-treasury/src/lib.rs | head -n 1)"
RPC_PORT="${MANA_TEST_RPC_PORT:-8899}"
RPC_URL="http://127.0.0.1:${RPC_PORT}"
LEDGER_DIR="${ROOT_DIR}/.anchor/mana-test-ledger"
LOG_FILE="${ROOT_DIR}/.anchor/mana-test-validator.log"
WALLET_FILE="$(mktemp /private/tmp/mana-treasury-wallet.XXXXXX.json)"
VALIDATOR_PID=""

cleanup() {
  if [[ -n "${VALIDATOR_PID}" ]] && kill -0 "${VALIDATOR_PID}" >/dev/null 2>&1; then
    kill "${VALIDATOR_PID}" >/dev/null 2>&1 || true
    wait "${VALIDATOR_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${WALLET_FILE}"
}
trap cleanup EXIT

mkdir -p "${ROOT_DIR}/.anchor"

if [[ ! -x "${ROOT_DIR}/node_modules/.bin/ts-mocha" ]]; then
  echo "Installing JavaScript test dependencies..."
  yarn install
fi

echo "Building mana_treasury with local-testing enabled..."
anchor build -p mana_treasury -- --features local-testing

solana-keygen new \
  -o "${WALLET_FILE}" \
  --no-bip39-passphrase \
  --force \
  --silent
WALLET_PUBKEY="$(solana-keygen pubkey "${WALLET_FILE}")"

echo "Starting local validator on ${RPC_URL}..."
solana-test-validator \
  --reset \
  --quiet \
  --ledger "${LEDGER_DIR}" \
  --rpc-port "${RPC_PORT}" \
  --mint "${WALLET_PUBKEY}" \
  --bpf-program "${PROGRAM_ID}" "${ROOT_DIR}/target/deploy/mana_treasury.so" \
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

echo "Running Mana treasury integration test..."
ANCHOR_PROVIDER_URL="${RPC_URL}" \
ANCHOR_WALLET="${WALLET_FILE}" \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/mana_treasury.test.ts
