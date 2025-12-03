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
  console.log('🚀 Starting FINAL Computation Definition initialization for generate_random...');
  
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  // Get program
  const program = anchor.workspace.Randomizer as anchor.Program<Randomizer>;
  console.log('📋 Using program ID:', program.programId.toString());
  
  // Get owner keypair - using correct path from Anchor.toml
  const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  console.log('🔑 Using wallet:', walletPath);
  
  const owner = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );
  console.log('👤 Owner public key:', owner.publicKey.toString());
  
  // Get computation definition PDA using correct method
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offsetUint8Array = getCompDefAccOffset("generate_random");
  const offsetBuffer = Buffer.from(offsetUint8Array);
  
  const [compDefPDA] = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offsetBuffer],
    getArciumProgAddress()
  );
  
  console.log('🎯 Computation definition PDA:', compDefPDA.toString());
  console.log('🔢 Offset:', Buffer.from(offsetUint8Array).readUInt32LE(0));
  
  try {
    // STEP 1: Initialize the computation definition account
    console.log('\n=== STEP 1: Initializing computation definition account ===');
    
    // Проверяем существует ли аккаунт
    const existingAccount = await provider.connection.getAccountInfo(compDefPDA);
    if (existingAccount) {
      console.log('✅ Computation definition account already exists');
    } else {
      console.log('📝 Creating new computation definition account...');
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
        console.log('✅ Initialization transaction:', initSig);
        // Ждем подтверждения
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err: any) {
        console.error('❌ Failed to initialize computation definition:', err.message);
        throw err;
      }
    }
    
    // STEP 2: Circuit is loaded from IPFS automatically
    console.log('\n=== STEP 2: Using offchain circuit from IPFS ===');
    console.log('🌐 Circuit will be automatically fetched from IPFS URL specified in the program');
    console.log('   URL: https://aqua-obedient-ermine-263.mypinata.cloud/ipfs/bafybeidnggfmdbubfnsyu4nejmykn6b6gca74l4vfewud7iwmdojigj43y');

    if (!USE_OFFCHAIN_CIRCUIT) {
      // STEP 3: Finalize the computation definition (only for on-chain circuits)
      console.log('\n=== STEP 3: Finalizing computation definition ===');
      console.log('🔧 Building finalize transaction...');
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        Buffer.from(offsetUint8Array).readUInt32LE(0),
        program.programId
      );
      
      console.log('⏰ Setting recent blockhash...');
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      
      console.log('✍️  Signing and sending finalize transaction...');
      finalizeTx.sign(owner);
      const finalizeResult = await provider.sendAndConfirm(finalizeTx);
      console.log('✅ Finalize transaction sent:', finalizeResult);
    } else {
      console.log('\n=== STEP 3 SKIPPED ===');
      console.log('Offchain circuit is declared in the program, so no finalize transaction is required.');
      console.log('MXE nodes will fetch the circuit from the provided URL when the computation is queued.');
    }
    
    console.log('\n🎉 SUCCESS! Computation definition is ready!');
    console.log('📋 Summary:');
    console.log('  ✅ Computation definition account created');
    console.log('  ✅ Offchain circuit configured (loaded from IPFS)');  
    if (!USE_OFFCHAIN_CIRCUIT) {
      console.log('  ✅ Computation definition finalized on-chain');
    } else {
      console.log('  ✅ Finalize transaction skipped (offchain circuit will be fetched lazily)');
    }
    console.log('  🚀 Ready for random number generation!');
    
  } catch (error) {
    console.error('❌ Error during computation definition setup:', error);
    
    // Enhanced error logging
    if (error.logs) {
      console.error('📜 Transaction logs:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    
    process.exit(1);
  }
}

// Run the script
initGenerateRandomCompDefFinal().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
