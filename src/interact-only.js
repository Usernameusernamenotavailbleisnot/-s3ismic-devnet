const configLoader = require('./utils/config');
const logger = require('./utils/logger');
const Wallet = require('./models/wallet');
const DeployerService = require('./services/deployer');
const InteractionService = require('./services/interaction');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function interactWithExistingContracts(wallet, config, services) {
  try {
    const address = wallet.getAddress();
    logger.info(`\n${'='.repeat(50)}`);
    logger.info(`Processing wallet: ${address} (Interaction only mode)`);
    logger.info(`${'='.repeat(50)}`);
    
    // Check initial balance
    const initialBalance = await wallet.getBalance();
    logger.info(`Current balance: ${initialBalance} ETH`);
    
    // Get contracts deployed by this wallet
    const deployedContracts = services.deployer.getDeployedContractsByWallet(address);
    
    if (deployedContracts.length === 0) {
      logger.warn(`No deployed contracts found for wallet ${address}. Skipping.`);
      return;
    }
    
    logger.info(`Found ${deployedContracts.length} deployed contracts for this wallet`);
    
    // Interact with deployed contracts
    for (const contract of deployedContracts) {
      logger.info(`\n--- Interacting with contract: ${contract.address} ---`);
      const interactionCount = config.interaction.count || 10;
      
      try {
        logger.info(`Contract deployed at block ${contract.blockNumber}`);
        const interactionResults = await services.interaction.interact(
          wallet, 
          contract, 
          interactionCount
        );
        
        logger.info(`Completed ${interactionResults.successful}/${interactionResults.total} interactions`);
      } catch (error) {
        logger.error(`Failed to perform interactions with contract ${contract.address}: ${error.message}`);
      }
      
      // Wait between contract interactions
      const interactionDelay = config.interaction.delay || 2000;
      logger.info(`Waiting ${interactionDelay}ms before next contract...`);
      await sleep(interactionDelay);
    }
    
    // Check final balance
    const finalBalance = await wallet.getBalance();
    logger.info(`\nFinal balance: ${finalBalance} ETH`);
    logger.info(`Wallet ${address} processing completed`);
    
  } catch (error) {
    logger.error(`Error processing wallet ${wallet.getAddress()}: ${error.message}`);
  }
}

async function main() {
  try {
    logger.info('Starting Seismic Auto Interact Only Mode');
    logger.info('=======================================');
    
    // Load configuration
    const { config, privateKeys, proxies } = configLoader.load();
    logger.info(`Loaded ${privateKeys.length} private keys and ${proxies.length} proxies`);
    
    // Force interaction-only mode
    config.deploy.skipDeploy = true;
    config.interaction.onlyExisting = true;
    
    // Setup services
    const deployerService = new DeployerService(config.deploy);
    const loadedContracts = deployerService.loadPreviousDeployments();
    const interactionService = new InteractionService(config.interaction);
    
    if (loadedContracts.length === 0) {
      logger.error("No deployed contracts found in the deployments folder. Cannot proceed with interaction-only mode.");
      process.exit(1);
    }
    
    const services = {
      deployer: deployerService,
      interaction: interactionService
    };
    
    // Create wallet instances
    const wallets = [];
    for (let i = 0; i < privateKeys.length; i++) {
      try {
        const wallet = new Wallet(
          privateKeys[i],
          config.network.rpcUrl,
          proxies.length > i ? proxies[i] : null
        );
        wallets.push(wallet);
      } catch (error) {
        logger.error(`Failed to initialize wallet for private key ${i+1}: ${error.message}`);
      }
    }
    
    if (wallets.length === 0) {
      throw new Error('No wallets could be initialized. Check your private keys.');
    }
    
    logger.info(`Successfully initialized ${wallets.length} wallets`);
    
    // Process each wallet one by one
    for (let i = 0; i < wallets.length; i++) {
      await interactWithExistingContracts(wallets[i], config, services);
      
      // Wait between wallets
      if (i < wallets.length - 1) {
        const walletDelay = config.walletDelay || 5000;
        logger.info(`Waiting ${walletDelay}ms before processing next wallet...`);
        await sleep(walletDelay);
      }
    }
    
    logger.info('\nAll wallet processing completed successfully');
    
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { interactWithExistingContracts };