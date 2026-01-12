require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ethers = require('ethers');
const solc = require('solc'); // Uncomment when solc is installed
const { CONTRACT_REGISTRY_ADDRESS, CONTRACT_REGISTRY_ABI } = require('./config');

// Check for required environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN environment variable is required!');
  console.log('📝 Please create a .env file with your Telegram bot token.');
  console.log('🔗 Get your token from: https://t.me/botfather');
  process.exit(1);
}

// Initialize bot with polling
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Network configurations
const NETWORKS = {
  'mantle-testnet': {
    name: 'Mantle Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.mantle.xyz',
    chainId: 5003,
    isTestnet: true
  }
};

// User session storage (in-memory, cleared on restart)
const userSessions = new Map();

// Security warning message
const SECURITY_WARNING = `
🚨 **SECURITY WARNING** 🚨

**NEVER share your private key with anyone!**
**This bot only uses your private key for this deployment session and does not store it.**

Private keys give complete control over your funds. Use testnets for testing and only deploy to mainnets with small amounts for development.

**Recommended:** Start with Sepolia testnet to avoid losing real funds.
`;

// Main menu
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🤖 **Smart Contract Deployment Bot**

I can help you deploy smart contracts on multiple networks.

Available commands:
/deploy - Start contract deployment process
/mycontracts - View your deployed contracts
/help - Show help and security information
/networks - List available networks

${SECURITY_WARNING}
  `;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Start Deployment', callback_data: 'start_deploy' }],
        [{ text: '📋 Available Networks', callback_data: 'show_networks' }],
        [{ text: '❓ Help & Security', callback_data: 'show_help' }]
      ]
    }
  });
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 **Help & Security Information**

**How to use this bot:**
1. Use /deploy to start the deployment process
2. Provide your contract bytecode and ABI, or Solidity source code
3. Enter constructor parameters (if any)
4. Select target network (Sepolia testnet recommended for testing)
5. Provide your private key (session-only, never stored)
6. Confirm deployment
7. Use /mycontracts to view your deployed contracts

**Contract Input Options:**
- **Bytecode + ABI**: Provide compiled contract bytecode and ABI JSON
- **Solidity Source**: Provide Solidity code (will be compiled using solc-js)

**Supported Networks:**
${Object.entries(NETWORKS).map(([key, net]) =>
  `- ${net.name} (${net.isTestnet ? 'Testnet' : 'Mainnet'})${net.recommended ? ' ⭐ RECOMMENDED' : ''}`
).join('\n')}

${SECURITY_WARNING}

**Important Notes:**
- Always verify your contract code before deployment
- Test on testnets first
- Keep your private key secure
- This bot does not store any sensitive information
  `;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Networks command
bot.onText(/\/networks/, (msg) => {
  const chatId = msg.chat.id;
  showNetworks(chatId);
});

// Deploy command
bot.onText(/\/deploy/, (msg) => {
  const chatId = msg.chat.id;
  startDeploymentProcess(chatId);
});

// My contracts command
bot.onText(/\/mycontracts/, (msg) => {
  const chatId = msg.chat.id;
  showMyContracts(chatId);
});

// Handle callback queries
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  switch (data) {
    case 'start_deploy':
      startDeploymentProcess(chatId);
      break;
    case 'show_networks':
      showNetworks(chatId);
      break;
    case 'show_help':
      bot.processCommands({ text: '/help', chat: { id: chatId } });
      break;
    case 'input_bytecode_abi':
      handleContractInputType(chatId, 'bytecode_abi');
      break;
    case 'input_solidity':
      handleContractInputType(chatId, 'solidity');
      break;
    default:
      if (data.startsWith('network_')) {
        const network = data.replace('network_', '');
        handleNetworkSelection(chatId, network);
      } else if (data.startsWith('select_network_')) {
        const network = data.replace('select_network_', '');
        selectNetworkForDeployment(chatId, network);
      } else if (data === 'confirm_deploy') {
        requestPrivateKey(chatId);
      } else if (data === 'cancel_deploy') {
        cancelDeployment(chatId);
      } else if (data === 'use_demo_key') {
        useDemoKey(chatId);
      } else if (data === 'enter_own_key') {
        requestCustomPrivateKey(chatId);
      }
  }

  bot.answerCallbackQuery(query.id);
});

// Handle text messages for conversation flow
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if it's a command (already handled above)
  if (text && text.startsWith('/')) return;

  const session = userSessions.get(chatId);
  if (!session) return;

  switch (session.step) {
    case 'awaiting_contract_data':
      handleContractData(chatId, text);
      break;
    case 'awaiting_constructor_params':
      handleConstructorParams(chatId, text);
      break;
    case 'awaiting_contract_name':
      handleContractName(chatId, text);
      break;
    case 'awaiting_private_key_choice':
      // This is handled by callback queries now
      break;
    case 'awaiting_private_key':
      handlePrivateKey(chatId, text);
      break;
    case 'awaiting_address':
      handleAddressForContracts(chatId, text);
      break;
  }
});

// Helper functions
function showNetworks(chatId) {
  const networkButtons = Object.entries(NETWORKS).map(([key, net]) => [{
    text: `${net.name}${net.recommended ? ' ⭐' : ''}${net.isTestnet ? ' (Testnet)' : ''}`,
    callback_data: `network_${key}`
  }]);

  bot.sendMessage(chatId, '🌐 **Available Networks:**\n\nSelect a network to see details:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: networkButtons
    }
  });
}

function startDeploymentProcess(chatId) {
  // Clear any existing session
  userSessions.delete(chatId);

  // Initialize new session
  userSessions.set(chatId, {
    step: 'contract_input',
    contractData: null,
    constructorParams: null,
    network: null,
    privateKey: null
  });

  const message = `
🚀 **Contract Deployment Process**

I'll guide you through deploying your smart contract.

**Step 1: Contract Input**

Please provide your contract information. You have two options:

**Option A: Bytecode + ABI**
Send your contract bytecode and ABI in JSON format:
\`\`\`json
{
  "bytecode": "0x608060405234801561001057600080fd5b50d3801561001d57600080fd...",
  "abi": [...]
}
\`\`\`

**Option B: Solidity Source Code**
Send your Solidity contract source code (must include pragma and contract definition).

What would you like to provide?
  `;

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📄 I have Bytecode + ABI', callback_data: 'input_bytecode_abi' }],
        [{ text: '💻 I have Solidity Source', callback_data: 'input_solidity' }]
      ]
    }
  });
}

function handleNetworkSelection(chatId, network) {
  const netInfo = NETWORKS[network];
  if (!netInfo) return;

  const message = `
🌐 **${netInfo.name}**

**Chain ID:** ${netInfo.chainId}
**Type:** ${netInfo.isTestnet ? 'Testnet' : 'Mainnet'}
**RPC URL:** ${netInfo.rpcUrl}

${netInfo.isTestnet ?
  '✅ This is a testnet - perfect for testing your contracts!' :
  '⚠️ This is mainnet - real funds will be used for deployment!'
}

${netInfo.recommended ? '⭐ **RECOMMENDED** for first deployments' : ''}
  `;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

function handleContractInputType(chatId, type) {
  const session = userSessions.get(chatId);
  if (!session) return;

  session.contractInputType = type;
  session.step = 'awaiting_contract_data';

  let message = '';
  if (type === 'bytecode_abi') {
    message = `
📄 **Contract Bytecode + ABI**

Please send your contract data in JSON format:

\`\`\`json
{
  "bytecode": "0x608060405234801561001057600080fd5b50d3801561001d57600080fd...",
  "abi": [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    }
  ]
}
\`\`\`

Make sure:
- Bytecode starts with "0x"
- ABI is a valid JSON array
- Constructor parameters are correctly defined in ABI
    `;
  } else {
    message = `
💻 **Solidity Source Code**

Please send your complete Solidity contract source code.

Example:
\`\`\`solidity
pragma solidity ^0.8.0;

contract MyContract {
    uint256 public value;

    constructor(uint256 _initialValue) {
        value = _initialValue;
    }

    function setValue(uint256 _value) public {
        value = _value;
    }
}
\`\`\`

Make sure your code includes:
- Pragma version
- Contract definition
- Constructor (if needed)
    `;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

function handleContractData(chatId, text) {
  const session = userSessions.get(chatId);
  if (!session) return;

  try {
    let contractData = null;

    if (session.contractInputType === 'bytecode_abi') {
      contractData = JSON.parse(text);
      if (!contractData.bytecode || !contractData.abi) {
        throw new Error('Missing bytecode or abi fields');
      }
      if (!contractData.bytecode.startsWith('0x')) {
        throw new Error('Bytecode must start with 0x');
      }
    } else {
      // For Solidity source, we'll store it as-is and compile later
      contractData = { sourceCode: text };
    }

    session.contractData = contractData;
    session.step = 'awaiting_constructor_params';

    const message = `
✅ **Contract data received successfully!**

**Step 2: Constructor Parameters**

${getConstructorInfo(session.contractData, session.contractInputType)}

Please provide constructor parameters as a JSON array (empty array [] if no parameters needed):

Example: \`[123, "hello"]\` or \`[]\` for no parameters
    `;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, `❌ **Error parsing contract data:** ${error.message}\n\nPlease try again with valid ${session.contractInputType === 'bytecode_abi' ? 'JSON' : 'Solidity code'}.`);
  }
}

function getConstructorInfo(contractData, inputType) {
  if (inputType === 'solidity') {
    return 'Based on your Solidity code, please provide constructor parameters.';
  }

  const abi = contractData.abi;
  const constructorAbi = abi.find(item => item.type === 'constructor');

  if (!constructorAbi || !constructorAbi.inputs || constructorAbi.inputs.length === 0) {
    return '✅ No constructor parameters needed.';
  }

  const params = constructorAbi.inputs.map((input, index) =>
    `${index + 1}. \`${input.type}\` - ${input.name || 'unnamed'}`
  ).join('\n');

  return `Constructor requires ${constructorAbi.inputs.length} parameter(s):\n${params}`;
}

function handleConstructorParams(chatId, text) {
  const session = userSessions.get(chatId);
  if (!session) return;

  try {
    const params = JSON.parse(text);
    if (!Array.isArray(params)) {
      throw new Error('Parameters must be a JSON array');
    }

    session.constructorParams = params;
    session.step = 'awaiting_contract_name';

    const message = `
✅ **Constructor parameters set!**

**Step 3: Contract Name**

Please provide a name for your contract (this will be stored in the registry):

Example: \`MyToken\` or \`VotingContract\`
    `;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, `❌ **Error parsing constructor parameters:** ${error.message}\n\nPlease provide a valid JSON array, e.g., \`[123, "hello"]\` or \`[]\` for no parameters.`);
  }
}

function handleContractName(chatId, contractName) {
  const session = userSessions.get(chatId);
  if (!session) return;

  // Basic validation
  const trimmedName = contractName.trim();
  if (trimmedName.length === 0) {
    bot.sendMessage(chatId, '❌ **Contract name cannot be empty.**\n\nPlease provide a valid name for your contract.');
    return;
  }

  if (trimmedName.length > 100) {
    bot.sendMessage(chatId, '❌ **Contract name too long.**\n\nPlease provide a name with 100 characters or less.');
    return;
  }

  session.contractName = trimmedName;
  session.step = 'awaiting_network_selection';

  const networkButtons = Object.entries(NETWORKS).map(([key, net]) => [{
    text: `${net.name}${net.recommended ? ' ⭐' : ''}${net.isTestnet ? ' 🧪' : ''}`,
    callback_data: `select_network_${key}`
  }]);

  const message = `
✅ **Contract name set: "${trimmedName}"**

**Step 4: Select Network**

Choose the network for deployment:

${Object.entries(NETWORKS).map(([key, net]) =>
  `${net.recommended ? '⭐ ' : ''}${net.name} ${net.isTestnet ? '(Testnet)' : '(Mainnet)'}`
).join('\n')}

⚠️ **Important:** Testnets are free and safe for testing. Mainnets use real cryptocurrency!
  `;

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: networkButtons
    }
  });
}

function handleAddressForContracts(chatId, address) {
  const session = userSessions.get(chatId);
  if (!session || session.action !== 'view_contracts') return;

  // Basic validation
  if (!address.startsWith('0x') || address.length !== 42) {
    bot.sendMessage(chatId, '❌ **Invalid Ethereum address format.**\n\nAddress must be a 42-character hexadecimal string starting with 0x.\n\nExample: `0x1234567890abcdef1234567890abcdef12345678`', { parse_mode: 'Markdown' });
    return;
  }

  // Clear session
  userSessions.delete(chatId);

  // Query contracts for this address
  viewUserContracts(chatId, address);
}

function selectNetworkForDeployment(chatId, network) {
  const session = userSessions.get(chatId);
  if (!session) return;

  const netInfo = NETWORKS[network];
  if (!netInfo) return;

  session.network = network;
  session.step = 'deployment_confirmation';

  const message = `
🎯 **${netInfo.name} Selected**

${netInfo.isTestnet ?
  '🧪 **Testnet Deployment** - No real funds required!' :
  '💰 **Mainnet Deployment** - Will use real cryptocurrency!'
}

**Deployment Summary:**
- Contract Name: ${session.contractName}
- Network: ${netInfo.name}
- Constructor params: ${JSON.stringify(session.constructorParams)}

Ready to deploy your contract?

${SECURITY_WARNING}
  `;

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Deploy Contract', callback_data: 'confirm_deploy' }],
        [{ text: '❌ Cancel', callback_data: 'cancel_deploy' }]
      ]
    }
  });
}

function requestPrivateKey(chatId) {
  const session = userSessions.get(chatId);
  if (!session) return;

  session.step = 'awaiting_private_key_choice';

  const hasDemoKey = process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.startsWith('0x') && process.env.PRIVATE_KEY.length === 66;

  let message = `
🔐 **Private Key Required**

${SECURITY_WARNING}

**Choose your deployment option:**
`;

  const keyboard = [];

  if (hasDemoKey) {
    message += `**Option 1:** Use demo private key (for testing only)\n`;
    message += `**Option 2:** Enter your own private key\n\n`;
    message += `⚠️ **Demo Key Warning:** The demo key is for testing purposes only. Contracts deployed with the demo key will be owned by the bot administrator.\n\n`;

    keyboard.push(
      [{ text: '🎯 Use Demo Key (Testing)', callback_data: 'use_demo_key' }],
      [{ text: '🔑 Enter My Own Key', callback_data: 'enter_own_key' }]
    );
  } else {
    message += `Please enter your private key below.\n\n`;
    keyboard.push([{ text: '🔑 I\'ll Enter My Key', callback_data: 'enter_own_key' }]);
  }

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

function cancelDeployment(chatId) {
  userSessions.delete(chatId);
  bot.sendMessage(chatId, '❌ **Deployment cancelled.**\n\nUse /deploy to start again.', { parse_mode: 'Markdown' });
}

// Use the demo private key from environment
function useDemoKey(chatId) {
  const session = userSessions.get(chatId);
  if (!session) return;

  const demoKey = process.env.PRIVATE_KEY;
  if (!demoKey || !demoKey.startsWith('0x') || demoKey.length !== 66) {
    bot.sendMessage(chatId, '❌ **Demo key not configured properly.**\n\nPlease contact the administrator or enter your own private key.', { parse_mode: 'Markdown' });
    return;
  }

  session.privateKey = demoKey;
  session.step = 'deploying';

  // Show masked demo key for confirmation
  const maskedKey = demoKey.substring(0, 6) + '****************************' + demoKey.substring(demoKey.length - 4);
  bot.sendMessage(chatId, `🎯 **Using Demo Private Key:** \`${maskedKey}\`\n\n⚠️ **Warning:** This contract will be deployed using the bot's demo key. You will NOT own this contract!\n\n🚀 **Starting deployment process...**`, { parse_mode: 'Markdown' });

  // Start deployment process
  deployContract(chatId);
}

// Request user to enter their own private key
function requestCustomPrivateKey(chatId) {
  const session = userSessions.get(chatId);
  if (!session) return;

  session.step = 'awaiting_private_key';

  const message = `
🔑 **Enter Your Private Key**

${SECURITY_WARNING}

**⚠️ NEVER share your private key with anyone else!**

Please send your private key (64-character hexadecimal string starting with 0x):

Example: \`0x1234567890abcdef...\`

**Security Notes:**
- Your private key is only used for this deployment
- It is not stored or logged anywhere
- The session will be cleared after deployment
- **For security, your key will be masked when received**
- **Consider deleting the message containing your private key after deployment**
  `;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// Show user's deployed contracts
function showMyContracts(chatId) {
  // Check if ContractRegistry is configured
  if (CONTRACT_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
    bot.sendMessage(chatId, '❌ **Contract registry not configured.**\n\nPlease contact the administrator to set up the contract registry.', { parse_mode: 'Markdown' });
    return;
  }

  // Clear any existing session
  userSessions.delete(chatId);

  // Initialize new session for contract viewing
  userSessions.set(chatId, {
    step: 'awaiting_address',
    action: 'view_contracts'
  });

  const message = `
📋 **View Your Deployed Contracts**

To show your deployed contracts, I need your Ethereum address.

Please provide your Ethereum address (0x...):

Example: \`0x1234567890abcdef1234567890abcdef12345678\`

**Note:** This will only show contracts registered in our system.
  `;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// Compile Solidity source code using solc
function compileSolidity(sourceCode) {
  try {
    // Prepare input for solc
    const input = {
      language: 'Solidity',
      sources: {
        'contract.sol': {
          content: sourceCode
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['*']
          }
        }
      }
    };

    // Compile the contract
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    // Check for compilation errors
    if (output.errors) {
      const errors = output.errors.filter(error => error.severity === 'error');
      if (errors.length > 0) {
        throw new Error(`Compilation errors:\n${errors.map(err => err.message).join('\n')}`);
      }
    }

    // Extract contract data
    const contracts = output.contracts['contract.sol'];
    if (!contracts || Object.keys(contracts).length === 0) {
      throw new Error('No contracts found in the source code');
    }

    // Get the first contract (assuming single contract file)
    const contractName = Object.keys(contracts)[0];
    const contract = contracts[contractName];

    if (!contract.evm || !contract.evm.bytecode || !contract.evm.bytecode.object) {
      throw new Error('No bytecode generated. Check your contract code.');
    }

    return {
      bytecode: '0x' + contract.evm.bytecode.object,
      abi: contract.abi
    };

  } catch (error) {
    if (error.message.includes('Compilation errors:')) {
      throw error;
    }
    throw new Error(`Solidity compilation failed: ${error.message}`);
  }
}

function handlePrivateKey(chatId, privateKey) {
  const session = userSessions.get(chatId);
  if (!session) return;

  // Basic validation
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    bot.sendMessage(chatId, '❌ **Invalid private key format.**\n\nPrivate key must be a 64-character hexadecimal string starting with 0x.\n\nExample: `0x1234567890abcdef...`', { parse_mode: 'Markdown' });
    return;
  }

  session.privateKey = privateKey;
  session.step = 'deploying';

  // Acknowledge receipt with masked display for security
  const maskedKey = privateKey.substring(0, 6) + '****************************' + privateKey.substring(privateKey.length - 4);
  bot.sendMessage(chatId, `🔐 **Private key received:** \`${maskedKey}\`\n\n⚠️ **Security Note:** Your private key is visible in chat history. Consider deleting this message after deployment.\n\n🚀 **Starting deployment process...**`, { parse_mode: 'Markdown' });

  // Start deployment process
  deployContract(chatId);
}

async function deployContract(chatId) {
  const session = userSessions.get(chatId);
  if (!session) return;

  const netInfo = NETWORKS[session.network];
  if (!netInfo) {
    bot.sendMessage(chatId, '❌ **Network configuration error.**');
    userSessions.delete(chatId);
    return;
  }

  try {
    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(netInfo.rpcUrl);
    const wallet = new ethers.Wallet(session.privateKey, provider);

    bot.sendMessage(chatId, `🔄 **Deploying to ${netInfo.name}...**\n\nPlease wait while your contract is being deployed.`, { parse_mode: 'Markdown' });

    let contractFactory;

    if (session.contractInputType === 'bytecode_abi') {
      // Use bytecode and ABI directly
      contractFactory = new ethers.ContractFactory(
        session.contractData.abi,
        session.contractData.bytecode,
        wallet
      );
    } else {
      // Compile Solidity source code
      bot.sendMessage(chatId, `🔧 **Compiling Solidity code...**`, { parse_mode: 'Markdown' });

      const compiledData = compileSolidity(session.contractData.sourceCode);

      contractFactory = new ethers.ContractFactory(
        compiledData.abi,
        compiledData.bytecode,
        wallet
      );
    }

    // Deploy contract
    const contract = await contractFactory.deploy(...session.constructorParams);

    bot.sendMessage(chatId, `📋 **Transaction sent!**\n\nHash: \`${contract.deploymentTransaction().hash}\`\n\nWaiting for confirmation...`, { parse_mode: 'Markdown' });

    // Wait for deployment confirmation
    const deployedContract = await contract.waitForDeployment();

    const contractAddress = await deployedContract.getAddress();
    const txHash = contract.deploymentTransaction().hash;

    // Register contract with registry if configured
    let registryTxHash = null;
    if (CONTRACT_REGISTRY_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      bot.sendMessage(chatId, `📝 **Registering contract with registry...**`, { parse_mode: 'Markdown' });
      registryTxHash = await registerContractWithRegistry(
        wallet,
        contractAddress,
        session.contractName,
        session.network,
        txHash
      );
    }

    // Success message
    let successMessage = `
🎉 **Contract Deployed Successfully!**

📍 **Contract Address:** \`${contractAddress}\`
🔗 **Transaction Hash:** \`${txHash}\`
🌐 **Network:** ${netInfo.name}
⛽ **Block Number:** ${await provider.getBlockNumber()}
🔗 **View Contract on Explorer:** \`https://sepolia.mantlescan.xyz/address/${contractAddress}\`

**View on Block Explorer:**
${getBlockExplorerUrl(netInfo, contractAddress, txHash)}
`;

    if (registryTxHash) {
      successMessage += `

📋 **Contract Registered!**
🔗 **Registry Transaction:** \`${registryTxHash}\`
🏷️ **Contract Name:** ${session.contractName}
`;
    } else if (CONTRACT_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      successMessage += `

⚠️ **Note:** Contract registry not configured. Set CONTRACT_REGISTRY_ADDRESS in your .env file to enable contract registration.
`;
    }

    successMessage += `\n⚠️ **Save this information!** You cannot recover your contract address or transaction hash later.`;

    bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Deployment error:', error);
    let errorMessage = '❌ **Deployment failed.**\n\n';

    if (error.message.includes('Compilation errors:')) {
      errorMessage += '🔧 **Solidity Compilation Error:**\n\n';
      errorMessage += error.message.replace('Compilation errors:\n', '');
    } else if (error.message.includes('Solidity compilation failed:')) {
      errorMessage += '🔧 **Solidity Compilation Error:**\n\n';
      errorMessage += error.message.replace('Solidity compilation failed: ', '');
    } else if (error.message.includes('insufficient funds')) {
      errorMessage += '💰 **Insufficient funds** - Make sure your wallet has enough native tokens for gas fees.';
    } else if (error.message.includes('nonce')) {
      errorMessage += '🔢 **Nonce error** - Try again in a few seconds.';
    } else if (error.message.includes('gas')) {
      errorMessage += '⛽ **Gas error** - Contract might be too complex or gas limit too low.';
    } else {
      errorMessage += `Error: ${error.message}`;
    }

    errorMessage += '\n\nUse /deploy to try again.';

    bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
  } finally {
    // Clear session after deployment (success or failure)
    userSessions.delete(chatId);
  }
}

function getBlockExplorerUrl(network, contractAddress, txHash) {
  const explorers = {
    ethereum: {
      address: `https://etherscan.io/address/${contractAddress}`,
      tx: `https://etherscan.io/tx/${txHash}`
    },
    sepolia: {
      address: `https://sepolia.etherscan.io/address/${contractAddress}`,
      tx: `https://sepolia.etherscan.io/tx/${txHash}`
    },
    polygon: {
      address: `https://polygonscan.com/address/${contractAddress}`,
      tx: `https://polygonscan.com/tx/${txHash}`
    },
    mantle: {
      address: `https://explorer.mantle.xyz/address/${contractAddress}`,
      tx: `https://explorer.mantle.xyz/tx/${txHash}`
    },
    'mantle-testnet': {
      address: `https://explorer.testnet.mantle.xyz/address/${contractAddress}`,
      tx: `https://explorer.testnet.mantle.xyz/tx/${txHash}`
    }
  };

  const explorer = explorers[network];
  if (!explorer) return 'Block explorer not available for this network';

  return `📍 [Contract](${explorer.address})\n🔗 [Transaction](${explorer.tx})`;
}

// Register deployed contract with ContractRegistry
async function registerContractWithRegistry(wallet, contractAddress, contractName, network, txHash) {
  try {
    // Check if ContractRegistry address is configured
    if (CONTRACT_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.log('ContractRegistry address not configured, skipping registration');
      return null;
    }

    // Create ContractRegistry contract instance
    const contractRegistry = new ethers.Contract(
      CONTRACT_REGISTRY_ADDRESS,
      CONTRACT_REGISTRY_ABI,
      wallet
    );

    // Register the contract
    const tx = await contractRegistry.registerContract(
      contractName,
      contractAddress,
      network,
      txHash
    );

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log(`Contract registered with registry. Tx hash: ${receipt.hash}`);
    return receipt.hash;

  } catch (error) {
    console.error('Failed to register contract with registry:', error);
    // Don't throw error - registration failure shouldn't stop the deployment success
    return null;
  }
}

// View user's deployed contracts from registry
async function viewUserContracts(chatId, userAddress) {
  try {
    // Use the same network as the registry (you may need to configure this)
    // For now, we'll try Sepolia first, then fall back to other networks if needed
    let provider;
    let registryNetwork = 'sepolia'; // Default, but should match where your registry is deployed

    // You can make this configurable by adding CONTRACT_REGISTRY_NETWORK to .env
    const configuredNetwork = process.env.CONTRACT_REGISTRY_NETWORK || 'mantle-testnet';

    if (NETWORKS[configuredNetwork]) {
      provider = new ethers.JsonRpcProvider(NETWORKS[configuredNetwork].rpcUrl);
      registryNetwork = configuredNetwork;
    } else {
      provider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    }

    console.log(`Querying contract registry on network: ${registryNetwork}`);
    console.log(`Registry address: ${CONTRACT_REGISTRY_ADDRESS}`);
    console.log(`User address: ${userAddress}`);

    // Test if we can connect to the network
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`Connected to ${registryNetwork}, current block: ${blockNumber}`);
    } catch (networkError) {
      console.error(`Failed to connect to ${registryNetwork}:`, networkError.message);
      throw new Error(`Cannot connect to ${registryNetwork} network. Please check your configuration.`);
    }

    // Create ContractRegistry contract instance (read-only)
    const contractRegistry = new ethers.Contract(
      CONTRACT_REGISTRY_ADDRESS,
      CONTRACT_REGISTRY_ABI,
      provider
    );

    // Test if contract exists at the address
    try {
      const code = await provider.getCode(CONTRACT_REGISTRY_ADDRESS);
      if (code === '0x') {
        throw new Error(`No contract found at address ${CONTRACT_REGISTRY_ADDRESS} on ${registryNetwork}`);
      }
      console.log(`Contract found at ${CONTRACT_REGISTRY_ADDRESS}`);
    } catch (contractError) {
      console.error('Contract check failed:', contractError.message);
      throw new Error(`Contract not found at ${CONTRACT_REGISTRY_ADDRESS} on ${registryNetwork}`);
    }

    // Get user's contracts
    console.log('Calling getUserContracts...');
    const contracts = await contractRegistry.getUserContracts(userAddress);
    console.log(`Raw contracts response:`, contracts);

    if (!Array.isArray(contracts)) {
      console.error('Unexpected response format:', typeof contracts, contracts);
      throw new Error('Unexpected response format from contract');
    }

    console.log(`Found ${contracts.length} contracts for address ${userAddress}`);

    if (contracts.length === 0) {
      bot.sendMessage(chatId, `📭 **No contracts found for address:** \`${userAddress}\`\n\nYou haven't deployed any contracts through this system yet, or they haven't been registered.`, { parse_mode: 'Markdown' });
      return;
    }

    // Format contract list
    let message = `📋 **Your Deployed Contracts (${contracts.length})**\n\n`;

    contracts.forEach((contract, index) => {
      console.log(`Processing contract ${index}:`, contract);
      const networkInfo = NETWORKS[contract.network] || { name: contract.network };
      const timestamp = new Date(Number(contract.timestamp) * 1000).toLocaleString();

      message += `**${index + 1}. ${contract.name}**\n`;
      message += `📍 Address: \`${contract.contractAddress}\`\n`;
      message += `🌐 Network: ${networkInfo.name || contract.network}\n`;
      message += `🔗 Tx Hash: \`${contract.txHash}\`\n`;
      message += `📅 Deployed: ${timestamp}\n`;
      message += `👤 Deployer: \`${contract.deployer}\`\n\n`;
    });

    // Add explorer links for the first contract as example
    if (contracts.length > 0) {
      const firstContract = contracts[0];
      const explorerUrl = getBlockExplorerUrl(firstContract.network, firstContract.contractAddress, firstContract.txHash);
      if (explorerUrl !== 'Block explorer not available for this network') {
        message += `🔍 **View contracts on block explorer:**\n${explorerUrl}`;
      }
    }

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Failed to query user contracts:', error);
    let errorMsg = `❌ **Error retrieving contracts:** ${error.message}`;

    // Add troubleshooting tips
    errorMsg += `\n\n**Troubleshooting:**`;
    errorMsg += `\n- Check CONTRACT_REGISTRY_ADDRESS in your .env file`;
    errorMsg += `\n- Check CONTRACT_REGISTRY_NETWORK in your .env file`;
    errorMsg += `\n- Ensure the ContractRegistry contract is deployed on the specified network`;
    errorMsg += `\n- Verify your Ethereum address is correct`;

    bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
  }
}

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Contract Deployment Bot is running...');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});