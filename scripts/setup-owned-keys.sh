#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

NATIVE_MINT="So11111111111111111111111111111111111111112"
KEY_DIR="${KEY_DIR:-target/deploy}"
CP_SWAP_KEYPAIR="${CP_SWAP_KEYPAIR:-${KEY_DIR}/raydium_cp_swap-keypair.json}"
MANA_TREASURY_KEYPAIR="${MANA_TREASURY_KEYPAIR:-${KEY_DIR}/mana_treasury-keypair.json}"
ADMIN_KEYPAIR="${ADMIN_KEYPAIR:-${KEY_DIR}/mim_admin-keypair.json}"
FEE_RECEIVER_KEYPAIR="${FEE_RECEIVER_KEYPAIR:-${KEY_DIR}/create_pool_fee_receiver-keypair.json}"
ADMIN_PUBKEY="${ADMIN_PUBKEY:-}"
FEE_OWNER_PUBKEY="${FEE_OWNER_PUBKEY:-}"
FEE_RECEIVER="${FEE_RECEIVER:-}"
RPC_URL="${RPC_URL:-}"
CREATE_FEE_ACCOUNT=0
FORCE=0

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-owned-keys.sh [options]

Generates owned Solana keypairs and patches this repo away from Raydium-owned
program/admin/fee receiver addresses.

Defaults:
  Program keypairs: target/deploy/raydium_cp_swap-keypair.json
                    target/deploy/mana_treasury-keypair.json
  Admin keypair:    target/deploy/mim_admin-keypair.json
  Fee receiver:     generated WSOL token-account keypair owned by admin pubkey

Options:
  --force
      Regenerate and overwrite keypairs that already exist. Dangerous after deploys.

  --key-dir <path>
      Directory for generated keypairs. Default: target/deploy

  --cp-swap-keypair <path>
      Program keypair for raydium_cp_swap.

  --mana-treasury-keypair <path>
      Program keypair for mana_treasury.

  --admin-keypair <path>
      Admin signer keypair. Generated if missing.

  --admin-pubkey <pubkey>
      Use an existing wallet/multisig pubkey as admin instead of generating an
      admin keypair. When this is used, client_config.ini keypair paths are left
      unchanged because there is no signer file to point at.

  --fee-owner <pubkey>
      Owner authority for the WSOL create-pool fee receiver. Default: admin pubkey.

  --fee-receiver-keypair <path>
      Keypair for the WSOL create-pool fee receiver token account. Generated if
      missing unless --fee-receiver is provided.

  --fee-receiver <pubkey>
      Explicit existing WSOL token account address for create-pool fees. When
      this is used, the script will not generate a fee receiver keypair.

  --create-fee-account
      Also create the generated WSOL fee receiver token account on-chain with
      spl-token. Requires a funded fee payer keypair and an RPC URL.

  --rpc-url <url>
      RPC URL used only with --create-fee-account.

Environment variables mirror the long option names:
  KEY_DIR, CP_SWAP_KEYPAIR, MANA_TREASURY_KEYPAIR, ADMIN_KEYPAIR,
  FEE_RECEIVER_KEYPAIR, ADMIN_PUBKEY, FEE_OWNER_PUBKEY, FEE_RECEIVER, RPC_URL

Examples:
  bash scripts/setup-owned-keys.sh
  bash scripts/setup-owned-keys.sh --force
  bash scripts/setup-owned-keys.sh --admin-pubkey <SQUADS_MULTISIG_OR_WALLET>
  bash scripts/setup-owned-keys.sh --create-fee-account --rpc-url https://api.devnet.solana.com
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --key-dir)
      KEY_DIR="$2"
      CP_SWAP_KEYPAIR="${KEY_DIR}/raydium_cp_swap-keypair.json"
      MANA_TREASURY_KEYPAIR="${KEY_DIR}/mana_treasury-keypair.json"
      ADMIN_KEYPAIR="${KEY_DIR}/mim_admin-keypair.json"
      FEE_RECEIVER_KEYPAIR="${KEY_DIR}/create_pool_fee_receiver-keypair.json"
      shift 2
      ;;
    --cp-swap-keypair)
      CP_SWAP_KEYPAIR="$2"
      shift 2
      ;;
    --mana-treasury-keypair)
      MANA_TREASURY_KEYPAIR="$2"
      shift 2
      ;;
    --admin-keypair)
      ADMIN_KEYPAIR="$2"
      shift 2
      ;;
    --admin-pubkey)
      ADMIN_PUBKEY="$2"
      shift 2
      ;;
    --fee-owner)
      FEE_OWNER_PUBKEY="$2"
      shift 2
      ;;
    --fee-receiver-keypair)
      FEE_RECEIVER_KEYPAIR="$2"
      shift 2
      ;;
    --fee-receiver)
      FEE_RECEIVER="$2"
      shift 2
      ;;
    --create-fee-account)
      CREATE_FEE_ACCOUNT=1
      shift
      ;;
    --rpc-url)
      RPC_URL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd perl
need_cmd solana-keygen

make_keypair() {
  local path="$1"
  local label="$2"
  mkdir -p "$(dirname "${path}")"

  if [[ -f "${path}" && "${FORCE}" -ne 1 ]]; then
    echo "Using existing ${label}: ${path}"
    return
  fi

  if [[ -f "${path}" && "${FORCE}" -eq 1 ]]; then
    echo "Regenerating ${label}: ${path}"
  else
    echo "Generating ${label}: ${path}"
  fi

  solana-keygen new \
    -o "${path}" \
    --no-bip39-passphrase \
    --force \
    --silent
}

replace_cfg_pair() {
  local file="$1"
  local module_name="$2"
  local value="$3"

  MODULE_NAME="${module_name}" VALUE="${value}" perl -0pi -e '
    my $module = $ENV{"MODULE_NAME"};
    my $value = $ENV{"VALUE"};
    my $quoted = quotemeta($module);
    s/(pub mod $quoted \{.*?#\[cfg\(feature = "devnet"\)\]\s*pub const ID: Pubkey = pubkey!\(")[^"]+("\);\s*#\[cfg\(not\(feature = "devnet"\)\)\]\s*pub const ID: Pubkey = pubkey!\(")[^"]+("\);)/$1$value$2$value$3/s
      or die "failed to replace pubkey module $module in $ARGV\n";
  ' "${file}"
}

make_keypair "${CP_SWAP_KEYPAIR}" "cp-swap program keypair"
make_keypair "${MANA_TREASURY_KEYPAIR}" "mana-treasury program keypair"

CP_SWAP_ID="$(solana-keygen pubkey "${CP_SWAP_KEYPAIR}")"
MANA_TREASURY_ID="$(solana-keygen pubkey "${MANA_TREASURY_KEYPAIR}")"

ADMIN_KEYPAIR_PATH_FOR_CONFIG=""
if [[ -n "${ADMIN_PUBKEY}" ]]; then
  echo "Using provided admin pubkey: ${ADMIN_PUBKEY}"
else
  make_keypair "${ADMIN_KEYPAIR}" "admin keypair"
  ADMIN_PUBKEY="$(solana-keygen pubkey "${ADMIN_KEYPAIR}")"
  ADMIN_KEYPAIR_PATH_FOR_CONFIG="${ADMIN_KEYPAIR}"
fi

if [[ -z "${FEE_OWNER_PUBKEY}" ]]; then
  FEE_OWNER_PUBKEY="${ADMIN_PUBKEY}"
fi

if [[ -z "${FEE_RECEIVER}" ]]; then
  make_keypair "${FEE_RECEIVER_KEYPAIR}" "create-pool fee receiver token-account keypair"
  FEE_RECEIVER="$(solana-keygen pubkey "${FEE_RECEIVER_KEYPAIR}")"
else
  FEE_RECEIVER_KEYPAIR=""
fi

echo "Patching program IDs and owner addresses..."

CP_SWAP_ID="${CP_SWAP_ID}" perl -0pi -e '
  my $id = $ENV{"CP_SWAP_ID"};
  s/(#\[cfg\(feature = "devnet"\)\]\s*declare_id!\(")[^"]+("\);\s*#\[cfg\(not\(feature = "devnet"\)\)\]\s*declare_id!\(")[^"]+("\);)/$1$id$2$id$3/s
    or die "failed to replace cp-swap declare_id values in $ARGV\n";
' programs/cp-swap/src/lib.rs

MANA_TREASURY_ID="${MANA_TREASURY_ID}" perl -0pi -e '
  my $id = $ENV{"MANA_TREASURY_ID"};
  s/declare_id!\("[^"]+"\);/declare_id!("$id");/
    or die "failed to replace mana-treasury declare_id in $ARGV\n";
' programs/mana-treasury/src/lib.rs

replace_cfg_pair "programs/cp-swap/src/lib.rs" "admin" "${ADMIN_PUBKEY}"
replace_cfg_pair "programs/cp-swap/src/lib.rs" "create_pool_fee_reveiver" "${FEE_RECEIVER}"
replace_cfg_pair \
  "programs/cp-swap/src/instructions/admin/create_support_mint_associated.rs" \
  "create_support_mint_associated_owner" \
  "${ADMIN_PUBKEY}"

CP_SWAP_ID="${CP_SWAP_ID}" MANA_TREASURY_ID="${MANA_TREASURY_ID}" perl -0pi -e '
  my $cp = $ENV{"CP_SWAP_ID"};
  my $mana = $ENV{"MANA_TREASURY_ID"};
  s/(raydium_cp_swap\s*=\s*")[^"]+(")/$1$cp$2/g;
  s/(mana_treasury\s*=\s*")[^"]+(")/$1$mana$2/g;
' Anchor.toml

if [[ -f client_config.ini ]]; then
  CP_SWAP_ID="${CP_SWAP_ID}" perl -0pi -e '
    my $cp = $ENV{"CP_SWAP_ID"};
    s/^(raydium_cp_program\s*=\s*).*$/${1}$cp/m;
  ' client_config.ini

  if [[ -n "${ADMIN_KEYPAIR_PATH_FOR_CONFIG}" ]]; then
    ADMIN_KEYPAIR_PATH_FOR_CONFIG="${ADMIN_KEYPAIR_PATH_FOR_CONFIG}" perl -0pi -e '
      my $path = $ENV{"ADMIN_KEYPAIR_PATH_FOR_CONFIG"};
      s/^(payer_path\s*=\s*).*$/${1}$path/m;
      s/^(admin_path\s*=\s*).*$/${1}$path/m;
    ' client_config.ini
  fi
fi

if [[ "${CREATE_FEE_ACCOUNT}" -eq 1 ]]; then
  need_cmd spl-token

  if [[ -z "${ADMIN_KEYPAIR_PATH_FOR_CONFIG}" ]]; then
    echo "--create-fee-account requires an admin keypair file, not only --admin-pubkey." >&2
    exit 1
  fi

  if [[ -z "${FEE_RECEIVER_KEYPAIR}" ]]; then
    echo "--create-fee-account requires a fee receiver keypair. Omit --fee-receiver or pass --fee-receiver-keypair." >&2
    exit 1
  fi

  if [[ -z "${RPC_URL}" ]]; then
    echo "--create-fee-account requires --rpc-url or RPC_URL." >&2
    exit 1
  fi

  echo "Creating WSOL fee receiver token account on ${RPC_URL} if needed..."
  spl-token create-account \
    "${NATIVE_MINT}" \
    "${FEE_RECEIVER_KEYPAIR}" \
    --owner "${FEE_OWNER_PUBKEY}" \
    --fee-payer "${ADMIN_KEYPAIR_PATH_FOR_CONFIG}" \
    --url "${RPC_URL}"
fi

cat <<EOF

Done.

cp-swap program id:        ${CP_SWAP_ID}
mana-treasury program id:  ${MANA_TREASURY_ID}
admin authority:           ${ADMIN_PUBKEY}
fee receiver owner:        ${FEE_OWNER_PUBKEY}
WSOL fee receiver account: ${FEE_RECEIVER}

Private keypairs are under:
  ${KEY_DIR}

Back these files up before deploying. Do not commit them.

Next checks:
  anchor build
  cargo test -p raydium-cp-swap --lib
  cargo test -p mana-treasury --lib
  yarn test:mana-local
EOF
