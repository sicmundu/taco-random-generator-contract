import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Randomizer } from "../target/types/randomizer";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  uploadCircuit,
  buildFinalizeCompDefTx,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getMXEPublicKey,
  getClusterAccAddress,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";

function shouldSkipPreflight(): boolean {
  const flag = (process.env.SKIP_PREFLIGHT || "").toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }
  if (flag === "0" || flag === "false" || flag === "no") {
    return false;
  }

  const provider = anchor.getProvider();
  const providerUrl =
    process.env.ANCHOR_PROVIDER_URL ||
    (provider ? provider.connection.rpcEndpoint : "");
  const isLocal =
    !providerUrl ||
    providerUrl.includes("127.0.0.1") ||
    providerUrl.includes("localhost") ||
    providerUrl.includes("://localnet");

  return !isLocal;
}

// Cluster configuration
// For localnet testing: null (uses ARCIUM_CLUSTER_PUBKEY from env)
// For devnet/testnet: specific cluster offset
// Set ARCIUM_CLUSTER_OFFSET environment variable or it will be auto-detected from ANCHOR_PROVIDER_URL
function getClusterOffset(): number | null {
  try {
    // First check if ARCIUM_CLUSTER_OFFSET is explicitly set
    if (process.env.ARCIUM_CLUSTER_OFFSET) {
      const offset = parseInt(process.env.ARCIUM_CLUSTER_OFFSET, 10);
      if (!isNaN(offset)) {
        return offset;
      }
    }
    
    // Otherwise, auto-detect from ANCHOR_PROVIDER_URL
    const url = process.env.ANCHOR_PROVIDER_URL || '';
    if (url.includes('devnet') || url.includes('testnet')) {
      return 768109697; // Default devnet cluster offset (must match deployment)
    }
    return null;
  } catch (error) {
    // Fallback to null if env is not available
    return null;
  }
}

/**
 * Gets the cluster account address based on configuration.
 * - If CLUSTER_OFFSET is set: Uses getClusterAccAddress (devnet/testnet)
 * - If null: Uses getArciumEnv().arciumClusterPubkey (localnet)
 * 
 * Note: This function must be called AFTER anchor.setProvider() has been called
 */
function getClusterAccount(): PublicKey {
  const clusterOffset = getClusterOffset();
  if (clusterOffset !== null) {
    return getClusterAccAddress(clusterOffset);
  } else {
    // Ensure provider is set before calling getArciumEnv
    const provider = anchor.getProvider();
    if (!provider) {
      throw new Error("Anchor provider must be set before calling getClusterAccount()");
    }
    return getArciumEnv().arciumClusterPubkey;
  }
}

describe("Randomizer", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Randomizer as Program<Randomizer>;
  const provider = anchor.getProvider();

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);

    return event;
  };

  it("generate random number in range!", async () => {
    const clusterAccount = getClusterAccount();
    const skipPreflight = shouldSkipPreflight();
    // Use ANCHOR_WALLET from environment if set, otherwise use default
    const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
    const owner = readKpJson(walletPath);
    console.log(`Using wallet: ${walletPath}`);
    console.log(`Wallet address: ${owner.publicKey.toString()}`);

    // Wait for MXE to be ready (this also "warms up" the provider)
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );
    console.log("MXE x25519 pubkey is", mxePublicKey);

    console.log("Initializing generate_random computation definition");
    // Using offchain circuit from IPFS, so offchainSource=true
    const initGenerateRandomSig = await initGenerateRandomCompDef(
      program,
      owner,
      false,
      true // offchainSource=true - circuit is loaded from IPFS
    );
    console.log(
      "Generate random computation definition initialized with signature",
      initGenerateRandomSig
    );

    // Define the range [min, max]
    const min = new anchor.BN(1);
    const max = new anchor.BN(100);

    const generateRandomEventPromise = awaitEvent("generateRandomEvent");

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    console.log("Cluster account:", clusterAccount.toString());
    console.log("Computation offset:", computationOffset.toString());
    console.log("Min:", min.toString(), "Max:", max.toString());
    
    let queueSig: string;
    try {
      queueSig = await program.methods
        .generateRandom(
          computationOffset,
          min,
          max
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(
            program.programId,
            computationOffset
          ),
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(program.programId),
          executingPool: getExecutingPoolAccAddress(program.programId),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("generate_random")).readUInt32LE()
          ),
        })
        .rpc({ skipPreflight, commitment: "confirmed" });
      console.log("Queue sig is ", queueSig);
    } catch (error: any) {
      console.error("Error calling generateRandom:", error);
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
      }
      if (error.error) {
        console.error("Error details:", JSON.stringify(error.error, null, 2));
      }
      throw error;
    }

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const generateRandomEvent = await generateRandomEventPromise;

    const result = generateRandomEvent.result.toNumber();
    console.log(`Generated random number: ${result}`);

    // Verify that the result is within the specified range
    if (result >= min.toNumber() && result <= max.toNumber()) {
      console.log(
        `Success! Random number ${result} is within range [${min}, ${max}]`
      );
    } else {
      throw new Error(
        `Random number ${result} is outside the range [${min}, ${max}]`
      );
    }
  });

  async function initGenerateRandomCompDef(
    program: Program<Randomizer>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("generate_random");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    // Check if account already exists
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const existingAccount = await provider.connection.getAccountInfo(compDefPDA);
    
    if (existingAccount) {
      console.log("Computation definition account already exists, skipping initialization");
      return "skipped";
    }

    const sig = await program.methods
      .initGenerateRandomCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log("Init generate_random computation definition transaction", sig);

    // With offchain circuit, no need to upload circuit locally
    // The circuit is automatically fetched from IPFS URL specified in the program
    // However, we still need to finalize the computation definition
    if (!offchainSource && !uploadRawCircuit) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    // Note: When using offchain circuit (offchainSource=true), 
    // the circuit is fetched from IPFS automatically, no finalization needed
    return sig;
  }
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}
