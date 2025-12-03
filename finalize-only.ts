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
  console.log('🚀 Финализация только computation definition...');

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Используем program ID из workspace (актуальный)
  const program = anchor.workspace.Randomizer as anchor.Program<Randomizer>;
  const programId = program.programId;
  console.log('📋 Используется program ID:', programId.toString());

  const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  const owner = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );
  console.log('👤 Публичный ключ владельца:', owner.publicKey.toString());

  try {
    // ШАГ: Финализация computation definition
    console.log('\n=== Финализация computation definition ===');

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
        `Computation definition account ${compDefAddress.toBase58()} не найден. Сначала запустите init-comp-def-final.ts`
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
      console.log('⚠️  Финализация пропущена: данная computation definition использует offchain circuit.');
      if (sourceUrl) {
        console.log('   URL из аккаунта:', sourceUrl);
      }
      console.log(
        '   Для offchain circuit финализация не требуется — MXE узлы загрузят схемы по указанному URL.'
      );
      return;
    }

    console.log('🔧 Создание транзакции финализации...');
    
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      compDefOffset,
      programId
    );

    console.log('⏰ Установка последнего blockhash...');
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    console.log('✍️  Подписание и отправка транзакции финализации...');
    finalizeTx.sign(owner);
    const finalizeResult = await provider.sendAndConfirm(finalizeTx);
    console.log('✅ Транзакция финализации отправлена:', finalizeResult);
    console.log('Просмотр в Solana Explorer:', `https://explorer.solana.com/tx/${finalizeResult}?cluster=devnet`);

    console.log('\n🎉 УСПЕХ! Computation definition полностью финализирован!');
  } catch (error: any) {
    console.error('❌ Ошибка во время финализации:', error);
    if (error.logs) {
      console.error('📜 Логи транзакции:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    process.exit(1);
  }
}

finalizeOnly().catch(console.error);
