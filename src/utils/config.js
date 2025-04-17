const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const logger = require('./logger');

class ConfigLoader {
  constructor() {
    this.config = null;
    this.privateKeys = [];
    this.proxies = [];
  }

  load() {
    try {
      // Load config.yaml
      const configPath = path.resolve(process.cwd(), 'config.yaml');
      const configFile = fs.readFileSync(configPath, 'utf8');
      this.config = yaml.load(configFile);

      // Load private keys from pk.txt
      const pkPath = path.resolve(process.cwd(), 'pk.txt');
      const pkFile = fs.readFileSync(pkPath, 'utf8');
      this.privateKeys = pkFile.split('\n')
        .map(pk => pk.trim())
        .filter(pk => pk.length > 0);

      // Load proxies from proxy.txt
      const proxyPath = path.resolve(process.cwd(), 'proxy.txt');
      if (fs.existsSync(proxyPath)) {
        const proxyFile = fs.readFileSync(proxyPath, 'utf8');
        this.proxies = proxyFile.split('\n')
          .map(proxy => proxy.trim())
          .filter(proxy => proxy.length > 0);
      }

      if (this.privateKeys.length === 0) {
        throw new Error('No private keys found in pk.txt');
      }

      // Ensure we have enough proxies (or none)
      if (this.proxies.length > 0 && this.proxies.length < this.privateKeys.length) {
        logger.warn(`Not enough proxies (${this.proxies.length}) for all private keys (${this.privateKeys.length}). Some wallets will work without proxy.`);
      }

      return {
        config: this.config,
        privateKeys: this.privateKeys,
        proxies: this.proxies
      };
    } catch (error) {
      logger.error(`Error loading configuration: ${error.message}`);
      process.exit(1);
    }
  }

  getConfig() {
    if (!this.config) {
      this.load();
    }
    return this.config;
  }

  getPrivateKeys() {
    if (this.privateKeys.length === 0) {
      this.load();
    }
    return this.privateKeys;
  }

  getProxies() {
    return this.proxies;
  }

  getWalletConfigs() {
    const privateKeys = this.getPrivateKeys();
    const proxies = this.getProxies();
    
    return privateKeys.map((pk, index) => {
      return {
        privateKey: pk,
        proxy: proxies.length > index ? proxies[index] : null
      };
    });
  }
}

module.exports = new ConfigLoader();