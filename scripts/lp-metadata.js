const {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} = require("@solana/web3.js");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const METADATA_SEED = Buffer.from("metadata");
const LP_METADATA_NAME_PREFIX = "MIM Swap LP: ";
const LP_METADATA_MAX_NAME_BYTES = 32;
const LP_METADATA_MAX_SYMBOL_BYTES = 10;
const LP_METADATA_MAX_URI_BYTES = 200;

function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value, maxBytes) {
  let output = "";
  let used = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (used + characterBytes > maxBytes) {
      break;
    }
    output += character;
    used += characterBytes;
  }
  return output;
}

function metadataSymbolPart(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  return normalized || "TOKEN";
}

function buildLpMetadataSymbol(token0Symbol, token1Symbol) {
  const token0 = metadataSymbolPart(token0Symbol);
  const token1 = metadataSymbolPart(token1Symbol);
  const full = `${token0}-${token1}`;
  if (utf8Bytes(full) <= LP_METADATA_MAX_SYMBOL_BYTES) {
    return full;
  }

  let token0Budget = Math.min(utf8Bytes(token0), 4);
  let token1Budget = LP_METADATA_MAX_SYMBOL_BYTES - 1 - token0Budget;
  let token0Part = truncateUtf8(token0, token0Budget);
  let token1Part = truncateUtf8(token1, token1Budget);

  if (utf8Bytes(token0Part) < token0Budget) {
    token1Budget = LP_METADATA_MAX_SYMBOL_BYTES - 1 - utf8Bytes(token0Part);
    token1Part = truncateUtf8(token1, token1Budget);
  }
  if (utf8Bytes(token1Part) < token1Budget) {
    token0Budget = LP_METADATA_MAX_SYMBOL_BYTES - 1 - utf8Bytes(token1Part);
    token0Part = truncateUtf8(token0, token0Budget);
  }

  return `${token0Part}-${token1Part}`;
}

function buildLpMetadata({ token0Symbol, token1Symbol, uri = "" }) {
  if (utf8Bytes(uri) > LP_METADATA_MAX_URI_BYTES) {
    throw new Error("LP metadata URI is too long.");
  }

  const token0 = metadataSymbolPart(token0Symbol);
  const token1 = metadataSymbolPart(token1Symbol);
  const pairName = `${token0}/${token1}`;
  const nameBudget =
    LP_METADATA_MAX_NAME_BYTES - utf8Bytes(LP_METADATA_NAME_PREFIX);

  return {
    name: `${LP_METADATA_NAME_PREFIX}${truncateUtf8(pairName, nameBudget)}`,
    symbol: buildLpMetadataSymbol(token0, token1),
    uri,
  };
}

function encodeU16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function encodeCreateMetadataAccountV3Data({ name, symbol, uri }) {
  return Buffer.concat([
    Buffer.from([33]),
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
    encodeU16(0),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([1]),
    Buffer.from([0]),
  ]);
}

function createMetadataAccountV3Instruction({
  metadata,
  mint,
  mintAuthority,
  payer,
  updateAuthority,
  name,
  symbol,
  uri,
}) {
  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: encodeCreateMetadataAccountV3Data({ name, symbol, uri }),
  });
}

function deriveMetadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function readMetadataText(data) {
  let offset = 1 + 32 + 32;
  const readString = () => {
    const length = data.readUInt32LE(offset);
    offset += 4;
    const value = data
      .subarray(offset, offset + length)
      .toString("utf8")
      .replace(/\0+$/, "");
    offset += length;
    return value;
  };
  return {
    name: readString(),
    symbol: readString(),
    uri: readString(),
  };
}

module.exports = {
  TOKEN_METADATA_PROGRAM_ID,
  buildLpMetadata,
  createMetadataAccountV3Instruction,
  deriveMetadataPda,
  readMetadataText,
};
