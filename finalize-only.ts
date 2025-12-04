import * as fs from 'fs';
import * as os from 'os';
import * as anchor from '@coral-xyz/anchor';
import {
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
  getCompDefAccAddress,
  getArciumProgram,
} from '@arcium-hq/client';
import { Randomizer } from './target/types/randomizer';

async function finalizeOnly() {
  console.log('Finalizing computation definition...');

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Randomizer as anchor.Program<Randomizer>;
  const programId = program.programId;
  console.log('Program ID:', programId.toString());

  const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  const owner = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );
  console.log('Owner public key:', owner.publicKey.toString());

  try {
    console.log('\nFinalizing computation definition');

    const offsetUint8Array = getCompDefAccOffset("generate_random");
    const compDefOffset = Buffer.from(offsetUint8Array).readUInt32LE(0);
    const compDefAddress = getCompDefAccAddress(programId, compDefOffset);

    const arciumProgram = getArciumProgram(provider);
    const compDefAccount =
      await arciumProgram.account.computationDefinitionAccount.fetchNullable(
        compDefAddress
      );

    if (!compDefAccount) {
      throw new Error(
        `Computation definition account ${compDefAddress.toBase58()} not found. Run init-comp-def-final.ts first.`
      );
    }

    const circuitSource = compDefAccount.circuitSource as any;
    const circuitVariant =
      circuitSource && typeof circuitSource === 'object'
        ? Object.keys(circuitSource)[0]
        : 'unknown';

    if (circuitVariant !== 'onChain') {
      const sourceUrl =
        circuitVariant === 'offChain'
          ? circuitSource.offChain.source
          : undefined;
      console.log('Finalize skipped: this computation definition uses an offchain circuit.');
      if (sourceUrl) {
        console.log('   URL from account:', sourceUrl);
      }
      console.log(
        '   Offchain circuits do not need finalize — MXE nodes fetch the circuit from the provided URL.'
      );
      return;
    }

    console.log('Building finalize transaction...');
    
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      compDefOffset,
      programId
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    console.log('Signing and sending finalize transaction...');
    finalizeTx.sign(owner);
    const finalizeResult = await provider.sendAndConfirm(finalizeTx);
    console.log('Finalize transaction sent:', finalizeResult);
    console.log('View in Solana Explorer:', `https://explorer.solana.com/tx/${finalizeResult}?cluster=devnet`);

    console.log('\nSuccess: computation definition fully finalized.');
  } catch (error: any) {
    console.error('Error during finalization:', error);
    if (error.logs) {
      console.error('Transaction logs:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    process.exit(1);
  }
}

finalizeOnly().catch(console.error);
