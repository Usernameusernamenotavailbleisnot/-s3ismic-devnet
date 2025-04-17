const { ethers } = require('ethers');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class InteractionService {
  constructor(config) {
    this.config = config;
    this.delay = config.delay || 1000;
    this.interactions = [];
    this.interactionsDir = path.join(process.cwd(), 'interactions');
    
    // Create interactions directory if it doesn't exist
    if (!fs.existsSync(this.interactionsDir)) {
      fs.mkdirSync(this.interactionsDir);
    }
  }

  async interact(wallet, contractInfo, interactionCount) {
    try {
      const walletAddress = wallet.getAddress();
      logger.info(`Starting ${interactionCount} interactions with contract ${contractInfo.address} from wallet ${walletAddress}`);
      
      const contract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        wallet.getWallet()
      );

      const results = [];
      let successCount = 0;
      
      // Initialize contract state to avoid common errors
      try {
        // First set initial values
        logger.info("Initializing contract state...");
        const setValueTx = await contract.setValue(1000, { value: 0 });
        await setValueTx.wait();
        
        // Push some keys to the array to avoid "No keys to remove" errors
        const keyNames = ["init1", "init2", "init3", "init4", "init5"];
        for (const key of keyNames) {
          const setTx = await contract.setPublicNumber(key, 500, { value: 0 });
          await setTx.wait();
        }
        logger.info("Contract state initialized successfully");
      } catch (error) {
        logger.warn(`Failed to initialize contract state: ${error.message}`);
      }

      // Choose a random writable function from the ABI
      const writeFunctions = contractInfo.abi.filter(item => 
        item.type === 'function' && 
        item.stateMutability !== 'view' && 
        item.stateMutability !== 'pure'
      );
      
      if (writeFunctions.length === 0) {
        logger.warn('No writable functions found in the contract ABI');
        return { total: interactionCount, successful: 0, results: [] };
      }

      // Track functions that tend to fail to reduce their probability
      const problematicFunctions = new Set([
        'power', // Overflow issues
        'decrement', // "Value would be negative" issues
        'pop', // "No keys to remove" issues
        'divide' // Potential division by zero
      ]);
      
      // Filter functions to reduce probability of problematic ones
      const safeFunctions = writeFunctions.filter(fn => 
        !Array.from(problematicFunctions).some(problem => fn.name.toLowerCase().includes(problem))
      );

      // Better error handling - don't stop on errors
      // Continue trying other functions even after failures
      // Retry mechanism for failed interactions
      let retriesLeft = interactionCount * 0.5; // Allow up to 50% more attempts for retries
      let i = 0;
      
      while (successCount < interactionCount && (i < interactionCount || retriesLeft > 0)) {
        try {
          // Choose different sets of functions to try
          let functionPool;
          
          // Create some function variety but favor safe functions
          if (successCount < interactionCount * 0.3) {
            // First 30%: Favor initialization and setting values
            const initFunctions = writeFunctions.filter(fn => 
              fn.name.toLowerCase().includes('set') || 
              fn.name.toLowerCase().includes('init') ||
              fn.name.toLowerCase().includes('add') ||
              fn.name.toLowerCase().includes('increment')
            );
            functionPool = initFunctions.length > 0 ? initFunctions : safeFunctions;
          } else if (successCount < interactionCount * 0.7) {
            // Middle 40%: Use safe functions
            functionPool = safeFunctions.length > 0 ? safeFunctions : writeFunctions;
          } else {
            // Last 30%: Try any function including risky ones
            functionPool = writeFunctions;
          }
          
          const randomFunction = functionPool[Math.floor(Math.random() * functionPool.length)];
          
          // Generate appropriate arguments based on function name and input types
          const args = randomFunction.inputs.map(input => this._generateSafeArgument(input, randomFunction.name, wallet));
          
          logger.info(`[${i+1}/${interactionCount}] Calling ${randomFunction.name}(${args.join(', ')})`);
          
          // Call with gas limit to prevent certain failures
          const tx = await contract[randomFunction.name](...args, { 
            value: 0,
            gasLimit: 500000  // Set a reasonable gas limit to avoid some failures
          });
          const receipt = await tx.wait();
          
          // Record successful interaction
          const result = {
            interactionId: i + 1,
            function: randomFunction.name,
            arguments: args,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed?.toString(),
            timestamp: new Date().toISOString(),
            status: 'success'
          };
          
          results.push(result);
          successCount++;
          logger.info(`Interaction successful - TX: ${receipt.hash}, Gas used: ${receipt.gasUsed?.toString()}`);
          i++;
        } catch (error) {
          // For failed transactions, decide whether to retry
          if (i < interactionCount) {
            // This was a regular attempt, count it as a try
            logger.error(`Interaction ${i + 1} failed: ${error.message}`);
            
            results.push({
              interactionId: i + 1,
              error: error.message,
              timestamp: new Date().toISOString(),
              status: 'failed'
            });
            
            i++;
          } else if (retriesLeft > 0) {
            // This was a retry attempt
            retriesLeft--;
            logger.warn(`Retry attempt failed. ${retriesLeft} retries remaining.`);
          }
        }
        
        // Wait for delay before next interaction
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      
      // Save interaction results
      this.saveInteractions(results, walletAddress, contractInfo.address);
      
      logger.info(`Completed ${successCount}/${interactionCount} interactions successfully`);
      return {
        total: interactionCount,
        successful: successCount,
        results
      };
    } catch (error) {
      logger.error(`Contract interaction process failed: ${error.message}`);
      throw error;
    }
  }
  
  // Helper method to generate safe arguments based on function name and input type
  _generateSafeArgument(input, functionName, wallet) {
    const lowerFnName = functionName.toLowerCase();
    
    if (input.type === 'uint256') {
      // Use smaller values for power functions to avoid overflow
      if (lowerFnName.includes('power')) {
        return Math.floor(Math.random() * 5) + 2; // 2-6 range for power operations
      }
      // Use smaller values for decrement to avoid "Value would be negative"
      else if (lowerFnName.includes('decrement') || lowerFnName.includes('subtract')) {
        return Math.floor(Math.random() * 50) + 1; // 1-50 for decrements
      }
      // Use safer values for divide to avoid division by zero
      else if (lowerFnName.includes('divide')) {
        return Math.floor(Math.random() * 8) + 2; // 2-9 for division operations
      }
      // Larger values for increment and additions
      else if (lowerFnName.includes('increment') || lowerFnName.includes('add')) {
        return Math.floor(Math.random() * 100) + 10; // 10-109 for increments
      }
      // Default random number
      else {
        return Math.floor(Math.random() * 200) + 1; // 1-200
      }
    } else if (input.type === 'address') {
      return wallet.getAddress();
    } else if (input.type === 'string') {
      // Create meaningful key names based on function
      if (lowerFnName.includes('set')) {
        return `set_key_${Math.floor(Math.random() * 100)}`;
      } else if (lowerFnName.includes('store')) {
        return `store_key_${Math.floor(Math.random() * 100)}`;
      } else {
        return `key${Math.floor(Math.random() * 100)}`;
      }
    } else {
      return 0; // Default value for unknown types
    }
  }

  saveInteractions(results, walletAddress, contractAddress) {
    try {
      const filename = `${walletAddress.substring(0, 8)}_${contractAddress.substring(0, 8)}_${Date.now()}.json`;
      const filePath = path.join(this.interactionsDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      logger.info(`Interaction results saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save interaction results: ${error.message}`);
    }
  }
}

module.exports = InteractionService;