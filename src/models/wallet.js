const { ethers } = require('ethers');
const logger = require('../utils/logger');

class Wallet {
  constructor(privateKey, rpcUrl, proxy = null) {
    this.privateKey = privateKey;
    this.rpcUrl = rpcUrl;
    this.proxy = proxy;
    this.provider = null;
    this.wallet = null;
    this.initialize();
  }

  initialize() {
    try {
      // Setup provider with the RPC URL
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      // Setup wallet with private key and provider
      this.wallet = new ethers.Wallet(this.privateKey, this.provider);
      
      logger.info(`Wallet initialized: ${this.getAddress()}`);
    } catch (error) {
      logger.error(`Failed to initialize wallet: ${error.message}`);
      throw error;
    }
  }

  getAddress() {
    return this.wallet.address;
  }

  async getBalance() {
    try {
      const balance = await this.provider.getBalance(this.getAddress());
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error(`Failed to get balance: ${error.message}`);
      throw error;
    }
  }

  async sendTransaction(tx) {
    try {
      const result = await this.wallet.sendTransaction(tx);
      logger.info(`Transaction sent: ${result.hash}`);
      return result;
    } catch (error) {
      logger.error(`Transaction failed: ${error.message}`);
      throw error;
    }
  }

  getWallet() {
    return this.wallet;
  }

  getProvider() {
    return this.provider;
  }
}

module.exports = Wallet;