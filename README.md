# Taco Random Generator

A trustless random number generator smart contract built on Solana using Arcium's Multi-Party Computation (MPC) technology.

## Overview

This project demonstrates verifiable randomness generation on the blockchain using distributed entropy. Unlike traditional RNG solutions that require trusting a centralized oracle or operator, this implementation uses Arcium's MPC network to generate truly unpredictable random numbers.

## Why MPC Randomness?

Traditional random number generation has fundamental trust issues:

- **Server-side RNG**: Requires trusting operators not to manipulate outcomes
- **Client-side generation**: Can be inspected and gamed by users
- **Pseudorandom algorithms**: May have predictable patterns or biases

**Arcium's MPC Solution**: Multiple independent nodes contribute entropy. The final random value is deterministic given all inputs, but no single node (or even a dishonest majority) can predict or bias the outcome.

## Features

- Trustless random number generation in specified range [min, max]
- Verifiable randomness using distributed MPC computation
- No single point of failure or manipulation
- Event-driven architecture with callbacks
- Production-ready Solana smart contract

## How It Works

The random generation flow:

1. **Initialize Computation**: Set up the MPC computation definition with the offchain circuit
2. **Request Random Number**: User specifies min and max range boundaries
3. **Distributed Computation**: Arcium nodes collectively generate randomness using MPC
4. **Result Callback**: Random number is returned and emitted as an event

## Technical Implementation

### Program Structure

```
programs/randomizer/
  └── src/
      └── lib.rs          # Main smart contract logic
```

### Key Components

- **`init_generate_random_comp_def`**: Initializes the MPC computation definition
- **`generate_random`**: Queues a random number generation request
- **`generate_random_callback`**: Handles the MPC computation result
- **`GenerateRandomEvent`**: Event emitted with the generated random number

### MPC Circuit

The offchain MPC circuit is stored on Supabase and processes the random generation logic in a privacy-preserving manner.

## Setup & Installation

### Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.32.1
- Node.js 18+ / Yarn
- Arcium CLI

### Install Dependencies

```bash
yarn install
```

### Build the Program

```bash
arcium build
```

## Testing

Run the test suite:

```bash
arcium test
```

Or use the Anchor test command:

```bash
yarn test
```

## Deployment

### 1. Initialize Computation Definition

First, initialize the MPC computation definition:

```bash
ts-node init-comp-def-final.ts
```

### 2. Deploy to Localnet

```bash
anchor deploy --provider.cluster localnet
```

### 3. Deploy to Devnet/Mainnet

Update `Anchor.toml` cluster configuration and deploy:

```bash
anchor deploy --provider.cluster devnet
```

## Usage Example

### Generating a Random Number

```typescript
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Generate random number between 1 and 100
const min = 1n;
const max = 100n;
const computationOffset = 0n;

await program.methods
  .generateRandom(computationOffset, min, max)
  .accounts({
    payer: wallet.publicKey,
    // ... other accounts
  })
  .rpc();
```

### Listening for Results

```typescript
// Listen for GenerateRandomEvent
const listener = program.addEventListener(
  "GenerateRandomEvent",
  (event) => {
    console.log("Random number generated:", event.result);
  }
);
```

## Configuration

### Program ID

Current program ID: `3khnFsWgLNsJoWtpzmhmc8J7ckDJxQu2ibZY58K7ZvRT`

To change the program ID, update:
- `declare_id!()` in `programs/randomizer/src/lib.rs`
- Program mapping in `Anchor.toml`

### MPC Circuit URL

The offchain circuit is hosted at:
```
https://izromwpjybfzjqbkstqo.supabase.co/storage/v1/object/public/new/generate_random.arcis
```

## Architecture

### Accounts Structure

- **SignerAccount**: PDA for program signing authority
- **MXEAccount**: Arcium MPC execution environment
- **ComputationDefinitionAccount**: Defines the MPC computation parameters
- **ComputationAccount**: Individual computation instance
- **ClusterAccount**: Arcium node cluster information

### Security Features

- PDA-based signing for secure callback execution
- Computation definition validation
- Cluster verification
- Fee pool integration
- Instruction sysvar validation

## Development

### Project Structure

```
.
├── programs/
│   └── randomizer/           # Main smart contract
│       ├── src/
│       │   └── lib.rs
│       └── Cargo.toml
├── tests/                    # Integration tests
├── encrypted-ixs/            # MPC circuit logic
├── Anchor.toml              # Anchor configuration
├── Arcium.toml              # Arcium configuration
└── package.json             # Node dependencies
```

### Helper Scripts

- `init-comp-def-final.ts`: Initialize computation definition
- `finalize-only.ts`: Finalize MPC computations

## Use Cases

This verifiable random number generator is ideal for:

- Decentralized gaming and gambling
- Fair lotteries and airdrops
- NFT trait generation
- Random matchmaking systems
- Provably fair prize distribution
- Any scenario requiring trustless randomness

## Why Arcium?

Arcium's MPC network provides:

- **True Randomness**: No single entity can predict or manipulate outcomes
- **Verifiable**: All computations are cryptographically verifiable
- **Decentralized**: Multiple nodes contribute to entropy generation
- **Production-Ready**: Battle-tested MPC infrastructure on Solana

## License

This project is licensed under the MIT License.

## Resources

- [Arcium Documentation](https://docs.arcium.com)
- [Anchor Framework](https://www.anchor-lang.com)
- [Solana Documentation](https://docs.solana.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For questions and support, please open an issue in the GitHub repository.
