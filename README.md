# 🤖 DeployX - Telegram Smart Contract Deployment Bot

>**A secure Telegram bot for deploying smart contracts on the Mantle Sepolia Testnet using Node.js and ethers.js.**

## 🚀 Features

- **Mantle Sepolia Testnet**: Deploy to Mantle Sepolia Testnet with optimized configuration
- **Secure Private Key Handling**: Session-only usage with comprehensive security warnings
- **Flexible Contract Input**: Support for bytecode + ABI or Solidity source code
- **Interactive Deployment Flow**: Step-by-step guided deployment process
- **Real-time Feedback**: Transaction monitoring and confirmation updates
- **Block Explorer Links**: Direct links to view deployed contracts
- **Contract Registry Integration**: Optional automatic registration of deployed contracts

## 🛡️ Security Features

- **Session-Only Keys**: Private keys are never stored or logged
- **Clear Warnings**: Multiple security reminders throughout the process
- **Testnet Recommendations**: Promotes safe testing practices
- **Input Validation**: Comprehensive validation of all user inputs
- **Error Handling**: Safe failure recovery without exposing sensitive data

## 📋 Prerequisites

- Node.js (v16 or higher)
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Some cryptocurrency for gas fees (testnet tokens are free)

## ⚙️ Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp env.example .env
   ```

   Edit `.env` and add your Telegram bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_actual_bot_token_here
   ```

4. **Start the bot:**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Required Environment Variables

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather

### Optional Environment Variables

You can override the default Mantle Sepolia RPC URL by setting this in your `.env` file:
- `MANTLE_RPC_URL` (defaults to https://rpc.sepolia.mantle.xyz)

### Contract Registry Configuration

To enable automatic contract registration and viewing:

1. **Deploy the ContractRegistry contract** from `contracts/ContractRegistry.sol` to your desired network
2. **Add the contract address and network** to your `.env` file:
   ```
   CONTRACT_REGISTRY_ADDRESS=0x1234567890123456789012345678901234567890
   CONTRACT_REGISTRY_NETWORK=mantle-testnet
   ```

When configured, deployed contracts will be automatically registered with:
- Contract name
- Contract address
- Deployment network
- Transaction hash
- Deployer address
- Timestamp

Users can then view their deployed contracts using `/mycontracts`.

### Demo Private Key (Optional)

For testing purposes, you can configure a demo private key:

```
PRIVATE_KEY=0x1234567890abcdef...
```

**⚠️ SECURITY WARNING:** Only use for testing! Never use real funds with the demo key. When users choose "Use Demo Key", contracts will be deployed using this key and owned by you (the bot administrator).

Users will see two options:
- **Use Demo Key**: Deploys with your configured demo key (you own the contract)
- **Enter My Own Key**: Users provide their own private key (they own the contract)

## 📖 Usage

### Getting Started

1. **Find your bot on Telegram** and send `/start`
2. **Use `/deploy`** to begin the deployment process
3. **Follow the interactive prompts** to provide contract details
4. **Use `/mycontracts`** to view your previously deployed contracts

### Deployment Steps

1. **Contract Input**: Choose between bytecode+ABI or Solidity source
2. **Constructor Parameters**: Provide parameters as JSON array
3. **Contract Name**: Assign a name for registry tracking
4. **Private Key**: Choose between demo key or enter your own
5. **Confirmation**: Review and confirm deployment

### Viewing Your Contracts

Use `/mycontracts` to view all contracts you've deployed through this bot:

1. Send `/mycontracts`
2. Provide your Ethereum address
3. View your complete contract history with:
   - Contract names and addresses
   - Deployment networks
   - Transaction hashes
   - Timestamps
   - Block explorer links

#### Using Bytecode + ABI
```json
{
  "bytecode": "0x608060405234801561001057600080fd5b50d3801561001d57600080fd5b50600436106100365760003560e01c80635c60da1b1461003b575b600080fd5b6100436100b5565b6040805173ffffffffffffffffffffffffffffffffffffffff9092168252519081900360200190f35b73000000000000000000000000000000000000000090565b9091019056fe",
  "abi": [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "implementation",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
}
```

#### Using Solidity Source
```solidity
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private value;

    constructor(uint256 _initialValue) {
        value = _initialValue;
    }

    function set(uint256 _value) public {
        value = _value;
    }

    function get() public view returns (uint256) {
        return value;
    }
}
```

## 🌐 Supported Networks

| Network | Type | Recommended | Block Explorer |
|---------|------|-------------|----------------|
| Mantle Sepolia Testnet | Testnet | Yes | [Mantle Sepolia Explorer](https://rpc.sepolia.mantle.xyz) |

## 🚨 Security Warnings

### ⚠️ CRITICAL SECURITY NOTICE

**NEVER share your private key with anyone!**

- Private keys give complete control over your funds
- This bot only uses your private key for deployment during your session
- Keys are never stored, logged, or transmitted anywhere
- Always use testnets for development and testing
- Use dedicated addresses with minimal funds for deployment

### Best Practices

1. **Test on Testnets First**: Always deploy to testnets before mainnet
2. **Use Dedicated Addresses**: Create separate addresses for deployment
3. **Minimal Funds**: Keep only necessary funds in deployment addresses
4. **Verify Contracts**: Test your contracts thoroughly before deployment
5. **Backup Information**: Save contract addresses and transaction hashes

## 🤝 Commands

- `/start` - Initialize the bot and show welcome message
- `/deploy` - Start contract deployment process
- `/mycontracts` - View your deployed contracts from the registry
- `/networks` - List available networks
- `/help` - Show help and security information

## Images

<img width="891" height="693" alt="Screenshot 2026-01-13 at 12 25 06 AM" src="https://github.com/user-attachments/assets/54883860-3146-4217-a081-750a2ecf3982" />

<img width="673" height="557" alt="Screenshot 2026-01-13 at 12 25 21 AM" src="https://github.com/user-attachments/assets/7edf3a3a-1aeb-4148-9621-5ab436b87ffb" />

<img width="517" height="648" alt="Screenshot 2026-01-13 at 12 25 45 AM" src="https://github.com/user-attachments/assets/5c5eef0f-0af5-43f3-8b84-904913fb1359" />


## 📝 License

This project is open source. Please use responsibly and follow security best practices.

---
