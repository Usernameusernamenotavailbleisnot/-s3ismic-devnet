const { ethers } = require('ethers');
const logger = require('../utils/logger');
const ContractGenerator = require('../contracts/generator');
const fs = require('fs');
const path = require('path');

class DeployerService {
  constructor(config) {
    this.config = config;
    this.contractGenerator = new ContractGenerator();
    this.deployedContracts = [];
    this.deploymentsDir = path.join(process.cwd(), 'deployments');
    
    // Create deployments directory if it doesn't exist
    if (!fs.existsSync(this.deploymentsDir)) {
      fs.mkdirSync(this.deploymentsDir);
    }
    
    // Make contract generator accessible in other methods
    this.contractName = this.contractGenerator.contractName;
  }

  async deployContract(wallet, functionCount = 100, initialValue = 0) {
    try {
      const walletAddress = wallet.getAddress();
      logger.info(`Deploying contract with ${functionCount} functions from wallet: ${walletAddress}`);
      
      // Generate and compile the contract
      const contractSource = this.contractGenerator.generateContractSource(functionCount);
      const { abi, bytecode } = this.contractGenerator.compileContract(contractSource);
      
      // Create contract factory
      const factory = new ethers.ContractFactory(abi, bytecode, wallet.getWallet());
      
      // Deploy the contract with the initial value
      logger.info(`Deploying contract with initial value: ${initialValue}`);
      const contract = await factory.deploy(initialValue);
      
      // Wait for deployment transaction to be mined
      logger.info(`Waiting for deployment transaction to be mined...`);
      const receipt = await contract.deploymentTransaction().wait();
      
      const contractAddress = await contract.getAddress();
      logger.info(`Contract deployed at: ${contractAddress}`);
      logger.info(`Gas used for deployment: ${receipt.gasUsed.toString()}`);
      
      // Save deployed contract info
      const deployedContract = {
        address: contractAddress,
        abi,
        wallet: walletAddress,
        deployedAt: new Date().toISOString(),
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        functionCount
      };
      
      // Save to file
      this.saveDeployment(deployedContract, walletAddress);
      
      // Add to in-memory array
      this.deployedContracts.push(deployedContract);
      
      return deployedContract;
    } catch (error) {
      logger.error(`Contract deployment failed: ${error.message}`);
      throw error;
    }
  }

  saveDeployment(deployedContract, walletAddress) {
    try {
      const filename = `${walletAddress.substring(0, 8)}_${deployedContract.address.substring(0, 8)}_${Date.now()}.json`;
      const filePath = path.join(this.deploymentsDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(deployedContract, null, 2));
      logger.info(`Deployment info saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save deployment info: ${error.message}`);
    }
  }

  getDeployedContracts() {
    return this.deployedContracts;
  }

  loadPreviousDeployments() {
    try {
      const files = fs.readdirSync(this.deploymentsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.deploymentsDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const contract = JSON.parse(data);
          this.deployedContracts.push(contract);
        }
      }
      
      logger.info(`Loaded ${this.deployedContracts.length} previous deployments`);
      return this.deployedContracts;
    } catch (error) {
      logger.error(`Failed to load previous deployments: ${error.message}`);
      return [];
    }
  }
  
  getDeployedContractsByWallet(walletAddress) {
    return this.deployedContracts.filter(contract => 
      contract.wallet.toLowerCase() === walletAddress.toLowerCase()
    );
  }
}

module.exports = DeployerService;