import * as fs from 'fs';
import * as os from 'os';
import * as anchor from '@coral-xyz/anchor';
import {
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
  getMXEAccAddress,
  getArciumAccountBaseSeed,
  getArciumProgAddress
} from '@arcium-hq/client';
import { Randomizer } from './target/types/randomizer';
import { PublicKey } from '@solana/web3.js';

const USE_OFFCHAIN_CIRCUIT = true;

async function initGenerateRandomCompDefFinal() {
  console.log('Starting computation definition initialization for generate_random');

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Randomizer as anchor.Program<Randomizer>;
  console.log('Using program ID:', program.programId.toString());

  const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  console.log('Using wallet:', walletPath);

  const owner = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );
  console.log('Owner public key:', owner.publicKey.toString());

  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offsetUint8Array = getCompDefAccOffset("generate_random");
  const offsetBuffer = Buffer.from(offsetUint8Array);
  
  const [compDefPDA] = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offsetBuffer],
    getArciumProgAddress()
  );
  
  console.log('Computation definition PDA:', compDefPDA.toString());
  console.log('Offset:', Buffer.from(offsetUint8Array).readUInt32LE(0));
  
  try {
    console.log('\nStep 1: Initialize computation definition account');
    const existingAccount = await provider.connection.getAccountInfo(compDefPDA);
    if (existingAccount) {
      console.log('Computation definition account already exists');
    } else {
      console.log('Creating new computation definition account...');
      try {
        const initSig = await program.methods
          .initGenerateRandomCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
          })
          .signers([owner])
          .rpc({
            commitment: 'confirmed',
          });
        console.log('Initialization transaction:', initSig);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err: any) {
        console.error('Failed to initialize computation definition:', err.message);
        throw err;
      }
    }
    
    console.log('\nStep 2: Using offchain circuit from IPFS');
    console.log('Circuit URL: https://aqua-obedient-ermine-263.mypinata.cloud/ipfs/bafybeidnggfmdbubfnsyu4nejmykn6b6gca74l4vfewud7iwmdojigj43y');

    if (!USE_OFFCHAIN_CIRCUIT) {
      console.log('\nStep 3: Finalizing computation definition');
      console.log('Building finalize transaction...');
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        Buffer.from(offsetUint8Array).readUInt32LE(0),
        program.programId
      );
      
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      
      finalizeTx.sign(owner);
      const finalizeResult = await provider.sendAndConfirm(finalizeTx);
      console.log('Finalize transaction sent:', finalizeResult);
    } else {
      console.log('\nStep 3 skipped: offchain circuit is declared in the program.');
      console.log('MXE nodes will fetch the circuit from the provided URL when the computation is queued.');
    }
    
    console.log('\nComputation definition is ready.');
    console.log('Summary:');
    console.log('  - Computation definition account created');
    console.log('  - Offchain circuit configured (loaded from IPFS)');  
    if (!USE_OFFCHAIN_CIRCUIT) {
      console.log('  - Computation definition finalized on-chain');
    } else {
      console.log('  - Finalize transaction skipped (offchain circuit fetched lazily)');
    }
    console.log('Ready for random number generation.');
    
  } catch (error) {
    console.error('Error during computation definition setup:', error);

    if (error.logs) {
      console.error('Transaction logs:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    
    process.exit(1);
  }
}

initGenerateRandomCompDefFinal().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
