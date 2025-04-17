const configLoader = require('./utils/config');
const logger = require('./utils/logger');
const Wallet = require('./models/wallet');
const FaucetService = require('./services/faucet');
const DeployerService = require('./services/deployer');
const InteractionService = require('./services/interaction');
const { interactWithExistingContracts } = require('./interact-only');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processWallet(wallet, config, services) {
  try {
    const address = wallet.getAddress();
    logger.info(`\n${'='.repeat(50)}`);
    logger.info(`Processing wallet: ${address}`);
    logger.info(`${'='.repeat(50)}`);
    
    // 1. Check initial balance
    const initialBalance = await wallet.getBalance();
    logger.info(`Initial balance: ${initialBalance} ETH`);
    
    // 2. Claim from faucet if balance is low
    if (parseFloat(initialBalance) < config.minBalance) {
      logger.info(`Balance too low (${initialBalance} < ${config.minBalance}), claiming from faucet...`);
      
      // Setup default region if not specified in config
      const faucetConfig = config.faucet || {};
      if (!faucetConfig.defaultRegion && wallet.proxy && wallet.proxy.includes('geo-as')) {
        faucetConfig.defaultRegion = 'sg';
      }
      
      let retryCount = 0;
      let faucetSuccess = false;
      const maxFaucetRetries = faucetConfig.maxRetries || 3;
      
      while (!faucetSuccess && retryCount < maxFaucetRetries) {
        try {
          const faucetResult = await services.faucet.claimFaucet(address, wallet.proxy);
          
          if (faucetResult.success) {
            // Wait for transaction to be mined
            //logger.info(`Faucet claim initiated. Tx hash: ${faucetResult.txHash}`);
            logger.info('Waiting for faucet transaction to be mined...');
            await sleep(config.faucet.confirmationDelay || 10000);
            
            const newBalance = await wallet.getBalance();
            logger.info(`New balance after faucet claim: ${newBalance} ETH`);
            faucetSuccess = true;
          } else {
            retryCount++;
            if (retryCount < maxFaucetRetries) {
              const retryDelay = (faucetConfig.retryDelay || 5000) * retryCount;
              logger.warn(`Faucet claim attempt ${retryCount} failed: ${faucetResult.error}. Retrying in ${retryDelay/1000} seconds...`);
              await sleep(retryDelay);
            } else {
              logger.error(`Failed to claim from faucet after ${maxFaucetRetries} attempts: ${faucetResult.error}`);
              if (parseFloat(initialBalance) === 0) {
                logger.error(`Cannot proceed with zero balance. Skipping this wallet.`);
                return;
              }
            }
          }
        } catch (error) {
          retryCount++;
          if (retryCount < maxFaucetRetries) {
            const retryDelay = (faucetConfig.retryDelay || 5000) * retryCount;
            logger.warn(`Faucet claim attempt ${retryCount} failed with error: ${error.message}. Retrying in ${retryDelay/1000} seconds...`);
            await sleep(retryDelay);
          } else {
            logger.error(`Failed to claim from faucet after ${maxFaucetRetries} attempts: ${error.message}`);
            if (parseFloat(initialBalance) === 0) {
              logger.error(`Cannot proceed with zero balance. Skipping this wallet.`);
              return;
            }
          }
        }
      }
    }
    
    let deployedContracts = [];
    
    // Check if we should skip deployment
    if (config.deploy.skipDeploy || config.interaction.onlyExisting) {
      logger.info("Skipping deployment, using existing contracts...");
      deployedContracts = services.deployer.getDeployedContractsByWallet(address);
      
      if (deployedContracts.length === 0) {
        logger.warn(`No existing contracts found for this wallet. ${config.interaction.onlyExisting ? 'Cannot proceed in interact-only mode.' : 'Will deploy new contracts.'}`);
        
        if (config.interaction.onlyExisting) {
          return;
        }
      } else {
        logger.info(`Found ${deployedContracts.length} existing contracts for this wallet.`);
      }
    }
    
    // 3. Deploy contracts if needed and not in interact-only mode
    if (deployedContracts.length === 0 && !config.interaction.onlyExisting) {
      const deployCount = config.deploy.count || 1;
      
      for (let i = 0; i < deployCount; i++) {
        logger.info(`\n--- Deploying contract ${i + 1}/${deployCount} ---`);
        let functionCount = config.deploy.functionCount || 100;
        const initialValue = config.deploy.initialValue || 100;
        
        // Reset retry counter for each contract
        let retryCount = 0;
        let deploySuccess = false;
        const maxRetries = 3;
        
        while (!deploySuccess && retryCount < maxRetries) {
          try {
            // Reduce function count by 20% on each retry to reduce complexity
            if (retryCount > 0) {
              functionCount = Math.floor(functionCount * 0.8);
              logger.info(`Retrying with reduced function count: ${functionCount}`);
            }
            
            const deployedContract = await services.deployer.deployContract(
              wallet, 
              functionCount,
              initialValue
            );
            
            deployedContracts.push(deployedContract);
            logger.info(`Contract deployed successfully at ${deployedContract.address}`);
            deploySuccess = true;
          } catch (error) {
            retryCount++;
            if (retryCount < maxRetries) {
              logger.warn(`Failed deployment attempt ${retryCount}/${maxRetries}: ${error.message}`);
            } else {
              logger.error(`Failed to deploy contract ${i + 1} after ${maxRetries} attempts: ${error.message}`);
            }
          }
        }
        
        if (!deploySuccess) {
          continue;
        }
        
        // Wait between deployments
        if (i < deployCount - 1) {
          const deployDelay = config.deploy.delay || 5000;
          logger.info(`Waiting ${deployDelay}ms before next deployment...`);
          await sleep(deployDelay);
        }
      }
    }
    
    // 4. Interact with deployed contracts
    if (deployedContracts.length === 0) {
      logger.warn('No contracts were deployed successfully. Skipping interaction step.');
    } else {
      for (const contract of deployedContracts) {
        logger.info(`\n--- Interacting with contract: ${contract.address} ---`);
        const interactionCount = config.interaction.count || 10;
        
        try {
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
    }
    
    // 5. Check final balance
    const finalBalance = await wallet.getBalance();
    logger.info(`\nFinal balance: ${finalBalance} ETH`);
    logger.info(`Wallet ${address} processing completed`);
    
  } catch (error) {
    logger.error(`Error processing wallet ${wallet.getAddress()}: ${error.message}`);
  }
}

async function main() {
  try {
    logger.info('Starting Seismic Auto Deploy and Interact');
    logger.info('=======================================');
    
    // Load configuration
    const { config, privateKeys, proxies } = configLoader.load();
    logger.info(`Loaded ${privateKeys.length} private keys and ${proxies.length} proxies`);
    
    // Check for interact-only mode
    const interactOnly = config.interaction.onlyExisting === true || config.deploy.skipDeploy === true;
    if (interactOnly) {
      logger.info('Running in interact-only mode (will skip contract deployment)');
    }
    
    // Setup services
    const faucetService = new FaucetService(config.faucet);
    const deployerService = new DeployerService(config.deploy);
    deployerService.loadPreviousDeployments();
    const interactionService = new InteractionService(config.interaction);
    
    const services = {
      faucet: faucetService,
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
      await processWallet(wallets[i], config, services);
      
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

module.exports = { processWallet, main };