/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mana_treasury.json`.
 */
export type ManaTreasury = {
  "address": "57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e",
  "metadata": {
    "name": "manaTreasury",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "MIM-backed Mana treasury share vault"
  },
  "instructions": [
    {
      "name": "acceptTreasuryAuthority",
      "discriminator": [
        219,
        6,
        23,
        82,
        89,
        189,
        96,
        67
      ],
      "accounts": [
        {
          "name": "newAuthority",
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createAssetVault",
      "discriminator": [
        94,
        30,
        247,
        39,
        125,
        131,
        74,
        41
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState"
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "assetVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ]
          }
        },
        {
          "name": "assetTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ]
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositMim",
      "discriminator": [
        7,
        122,
        229,
        210,
        108,
        33,
        27,
        227
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "mimMint"
        },
        {
          "name": "manaMint",
          "writable": true
        },
        {
          "name": "depositorMim",
          "writable": true
        },
        {
          "name": "depositorMana",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "manaTokenProgram"
              },
              {
                "kind": "account",
                "path": "manaMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "activeMimVault",
          "writable": true
        },
        {
          "name": "mimTokenProgram"
        },
        {
          "name": "manaTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minManaOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "donateAsset",
      "discriminator": [
        84,
        167,
        87,
        235,
        27,
        195,
        239,
        31
      ],
      "accounts": [
        {
          "name": "donor",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState"
        },
        {
          "name": "assetMint"
        },
        {
          "name": "assetVault"
        },
        {
          "name": "donorAsset",
          "writable": true
        },
        {
          "name": "assetTokenAccount",
          "writable": true
        },
        {
          "name": "assetTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "donateMim",
      "discriminator": [
        138,
        138,
        188,
        3,
        152,
        26,
        66,
        55
      ],
      "accounts": [
        {
          "name": "donor",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState"
        },
        {
          "name": "mimMint"
        },
        {
          "name": "donorMim",
          "writable": true
        },
        {
          "name": "activeMimVault",
          "writable": true
        },
        {
          "name": "mimTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeDestake",
      "discriminator": [
        76,
        35,
        226,
        223,
        215,
        19,
        42,
        52
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "mimMint"
        },
        {
          "name": "manaMint",
          "writable": true
        },
        {
          "name": "pendingMimVault",
          "writable": true
        },
        {
          "name": "pendingManaVault",
          "writable": true
        },
        {
          "name": "ownerMim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "mimTokenProgram"
              },
              {
                "kind": "account",
                "path": "mimMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "redemptionRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mimTokenProgram"
        },
        {
          "name": "manaTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeManaMetadata",
      "discriminator": [
        132,
        105,
        182,
        165,
        74,
        162,
        47,
        224
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState"
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "manaMint"
        },
        {
          "name": "metadata",
          "writable": true
        },
        {
          "name": "metadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeTreasury",
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "mimMint"
        },
        {
          "name": "manaMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  110,
                  97,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "activeMimVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  118,
                  101,
                  95,
                  109,
                  105,
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "pendingMimVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  109,
                  105,
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "pendingManaVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  109,
                  97,
                  110,
                  97,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "mimTokenProgram"
        },
        {
          "name": "manaTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setCooldownSeconds",
      "discriminator": [
        50,
        10,
        223,
        88,
        99,
        38,
        232,
        11
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "cooldownSeconds",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setSwapRouter",
      "discriminator": [
        72,
        233,
        50,
        179,
        61,
        66,
        35,
        90
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "router",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setTreasuryAuthority",
      "discriminator": [
        131,
        244,
        37,
        32,
        108,
        28,
        31,
        8
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "pendingAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "startDestake",
      "discriminator": [
        176,
        156,
        48,
        231,
        76,
        114,
        103,
        125
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryState",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "mimMint"
        },
        {
          "name": "manaMint",
          "writable": true
        },
        {
          "name": "ownerMana",
          "writable": true
        },
        {
          "name": "pendingManaVault",
          "writable": true
        },
        {
          "name": "activeMimVault",
          "writable": true
        },
        {
          "name": "pendingMimVault",
          "writable": true
        },
        {
          "name": "redemptionRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mimTokenProgram"
        },
        {
          "name": "manaTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "manaAmount",
          "type": "u64"
        },
        {
          "name": "minMimOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "swapAssetToMim",
      "discriminator": [
        56,
        150,
        143,
        120,
        84,
        6,
        21,
        50
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "treasuryState"
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasuryState"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "assetVault"
        },
        {
          "name": "assetTokenAccount",
          "writable": true
        },
        {
          "name": "activeMimVault",
          "writable": true
        },
        {
          "name": "routerProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minMimOut",
          "type": "u64"
        },
        {
          "name": "routerIxData",
          "type": "bytes"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "assetVault",
      "discriminator": [
        193,
        119,
        127,
        25,
        157,
        102,
        175,
        164
      ]
    },
    {
      "name": "redemptionRequest",
      "discriminator": [
        117,
        157,
        214,
        214,
        64,
        160,
        31,
        58
      ]
    },
    {
      "name": "treasuryState",
      "discriminator": [
        240,
        56,
        226,
        158,
        138,
        244,
        79,
        154
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6001,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6002,
      "name": "exceededSlippage",
      "msg": "Exceeded slippage limit"
    },
    {
      "code": 6003,
      "name": "zeroManaOut",
      "msg": "Mana output is zero"
    },
    {
      "code": 6004,
      "name": "zeroMimOut",
      "msg": "MIM output is zero"
    },
    {
      "code": 6005,
      "name": "invalidTreasuryBalance",
      "msg": "Invalid treasury balance"
    },
    {
      "code": 6006,
      "name": "invalidAuthority",
      "msg": "Invalid authority"
    },
    {
      "code": 6007,
      "name": "invalidAssetMint",
      "msg": "Invalid asset mint"
    },
    {
      "code": 6008,
      "name": "invalidAssetVault",
      "msg": "Invalid asset vault"
    },
    {
      "code": 6009,
      "name": "invalidMetadataAccount",
      "msg": "Invalid metadata account"
    },
    {
      "code": 6010,
      "name": "swapRouterNotSet",
      "msg": "Swap router is not set"
    },
    {
      "code": 6011,
      "name": "invalidSwapRouter",
      "msg": "Invalid swap router"
    },
    {
      "code": 6012,
      "name": "invalidSwapResult",
      "msg": "Invalid swap result"
    },
    {
      "code": 6013,
      "name": "cooldownActive",
      "msg": "Cooldown is still active"
    },
    {
      "code": 6014,
      "name": "alreadyFinalized",
      "msg": "Redemption already finalized"
    },
    {
      "code": 6015,
      "name": "invalidRedemptionOwner",
      "msg": "Invalid redemption owner"
    }
  ],
  "types": [
    {
      "name": "assetVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "redemptionRequest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "manaAmount",
            "type": "u64"
          },
          {
            "name": "reservedMimAmount",
            "type": "u64"
          },
          {
            "name": "unlockTimestamp",
            "type": "i64"
          },
          {
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "treasuryState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "type": "pubkey"
          },
          {
            "name": "mimMint",
            "type": "pubkey"
          },
          {
            "name": "manaMint",
            "type": "pubkey"
          },
          {
            "name": "activeMimVault",
            "type": "pubkey"
          },
          {
            "name": "pendingMimVault",
            "type": "pubkey"
          },
          {
            "name": "pendingManaVault",
            "type": "pubkey"
          },
          {
            "name": "cooldownSeconds",
            "type": "u64"
          },
          {
            "name": "swapRouter",
            "type": "pubkey"
          },
          {
            "name": "pendingManaSupply",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
