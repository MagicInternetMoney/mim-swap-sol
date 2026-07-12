#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

CP_PROGRAM_ID="$(sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' programs/cp-swap/src/lib.rs | head -n 1)"
TOKEN_METADATA_PROGRAM_ID="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
ADMIN_KEYPAIR="${ADMIN_KEYPAIR:-target/deploy/mim_admin-keypair.json}"
FEE_RECEIVER_KEYPAIR="${FEE_RECEIVER_KEYPAIR:-target/deploy/create_pool_fee_receiver-keypair.json}"
RPC_PORT="${LP_METADATA_TEST_RPC_PORT:-8899}"
RPC_URL="http://127.0.0.1:${RPC_PORT}"
LEDGER_DIR="${ROOT_DIR}/.anchor/lp-metadata-test-ledger"
LOG_FILE="${ROOT_DIR}/.anchor/lp-metadata-test-validator.log"
DEFAULT_TOKEN_METADATA_SO="${ROOT_DIR}/target/deploy/metaplex_token_metadata.so"
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

echo "Building raydium_cp_swap..."
NO_DNA=1 anchor build -p raydium_cp_swap
TOKEN_METADATA_SO="${TOKEN_METADATA_PROGRAM_SO:-${DEFAULT_TOKEN_METADATA_SO}}"

if [[ ! -f "${TOKEN_METADATA_SO}" ]]; then
  mkdir -p "$(dirname "${TOKEN_METADATA_SO}")"
  echo "Downloading Metaplex Token Metadata program for local validator..."
  if ! solana program dump \
    --url mainnet-beta \
    "${TOKEN_METADATA_PROGRAM_ID}" \
    "${TOKEN_METADATA_SO}"; then
    echo "Unable to download Metaplex Token Metadata program." >&2
    echo "Set TOKEN_METADATA_PROGRAM_SO=/path/to/metaplex_token_metadata.so and retry." >&2
    exit 1
  fi
fi

if ! strings "${TOKEN_METADATA_SO}" | grep "Create Metadata Accounts v3" >/dev/null; then
  echo "Metaplex Token Metadata program does not support Create Metadata Accounts v3:" >&2
  echo "${TOKEN_METADATA_SO}" >&2
  echo "Set TOKEN_METADATA_PROGRAM_SO to a newer deployed Token Metadata program dump." >&2
  exit 1
fi

ADMIN_PUBKEY="$(solana-keygen pubkey "${ADMIN_KEYPAIR}")"
mkdir -p "${ROOT_DIR}/.anchor"

echo "Starting local validator on ${RPC_URL}..."
solana-test-validator \
  --reset \
  --quiet \
  --ledger "${LEDGER_DIR}" \
  --rpc-port "${RPC_PORT}" \
  --mint "${ADMIN_PUBKEY}" \
  --bpf-program "${TOKEN_METADATA_PROGRAM_ID}" "${TOKEN_METADATA_SO}" \
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

echo "Running LP metadata integration test..."
ANCHOR_PROVIDER_URL="${RPC_URL}" \
ANCHOR_WALLET="${ADMIN_KEYPAIR}" \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/lp_metadata.test.ts
