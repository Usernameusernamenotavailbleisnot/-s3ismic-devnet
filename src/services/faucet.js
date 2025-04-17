const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const logger = require('../utils/logger');
const NoCaptcha = require('../utils/nocaptcha');

class FaucetService {
  constructor(config) {
    this.faucetUrl = 'https://faucet-2.seismicdev.net/api/claim';
    this.refererUrl = 'https://faucet-2.seismicdev.net/';
    this.noCaptchaToken = config.noCaptchaToken;
    this.hcaptchaSiteKey = config.hcaptchaSiteKey || '0a76a396-7bf6-477e-947c-c77e66a8222e'; // Default hCaptcha sitekey
    this.delay = config.faucetDelay || 3000; // Default delay between requests
    this.maxRetries = config.maxRetries || 3; // Default max retries
    this.retryDelay = config.retryDelay || 5000; // Default retry delay
    this.defaultRegion = config.defaultRegion || 'sg'; // Default region for proxies
  }

  async claimFaucet(walletAddress, proxy = null) {
    const maxRetries = this.maxRetries;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        if (retryCount > 0) {
          logger.info(`Retry #${retryCount} - Claiming faucet for wallet: ${walletAddress}`);
        } else {
          logger.info(`Claiming faucet for wallet: ${walletAddress}`);
        }

        // Extract region from proxy if possible
        let region = null;
        if (proxy && proxy.toLowerCase().includes('country-')) {
          const match = proxy.match(/country-([A-Z]{2})/i);
          if (match && match[1]) {
            region = match[1].toLowerCase();
            logger.info(`Detected region from proxy: ${region}`);
          }
        }
        
        // For iproyal proxies, default to region based on geo prefix
        if (proxy && proxy.includes('iproyal') && !region) {
          if (proxy.includes('geo-as')) {
            region = 'sg';
          } else if (proxy.includes('geo-eu')) {
            region = 'uk';
          } else if (proxy.includes('geo-us')) {
            region = 'us';
          }
          
          if (region) {
            logger.info(`Using default region for iproyal proxy: ${region}`);
          }
        }

        // If region is still not determined, use default
        if (!region && this.defaultRegion) {
          region = this.defaultRegion;
          logger.info(`Using default region from config: ${region}`);
        }

        // Solve hCaptcha using NoCaptcha.io - with built-in retries
        const nocaptcha = new NoCaptcha(this.noCaptchaToken, proxy);
        const captchaResult = await nocaptcha.solveHCaptcha(
          this.hcaptchaSiteKey,
          this.refererUrl,
          { 
            region: region,
            maxRetries: 3 // Allow 3 retries for captcha solving
          }
        );

        // Add detailed debug logging for captcha result
        //logger.info(`Captcha result: ${JSON.stringify(captchaResult, null, 2)}`);

        if (!captchaResult) {
          throw new Error('Captcha result is null or undefined');
        }

        // Use the generated_pass_UUID as the h-captcha-response if response is not available
        const captchaToken = captchaResult.response || captchaResult.generated_pass_UUID;
        
        if (!captchaToken) {
          throw new Error(`Captcha result missing token: ${JSON.stringify(captchaResult)}`);
        }

        // Wait for delay before making the faucet request
        await new Promise(resolve => setTimeout(resolve, this.delay));

        // Setup axios config with proxy if provided
        const config = {
          headers: {
            'h-captcha-response': captchaToken,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Origin': this.refererUrl,
            'Referer': this.refererUrl,
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-GPC': '1'
          }
        };

        if (proxy) {
          const httpsAgent = new HttpsProxyAgent(proxy);
          const httpAgent = new HttpProxyAgent(proxy);
          config.httpsAgent = httpsAgent;
          config.httpAgent = httpAgent;
        }

        //logger.info(`Sending faucet request with payload: ${JSON.stringify({ address: walletAddress })}`);
        logger.debug(`Request headers: ${JSON.stringify(config.headers)}`);

        // Send faucet request
        try {
          const response = await axios.post(
            this.faucetUrl,
            { address: walletAddress },
            config
          );

          //logger.info(`Faucet API response: ${JSON.stringify(response.data)}`);

          if (response.data && response.data.msg) {
            const txHash = response.data.msg.split('Txhash: ')[1];
            logger.info(`Faucet claim successful: ${response.data.msg}`);
            return {
              success: true,
              txHash: txHash,
              message: response.data.msg
            };
          } else {
            throw new Error(`Unexpected response from faucet: ${JSON.stringify(response.data)}`);
          }
        } catch (apiError) {
          logger.error(`Faucet API error: ${apiError.message}`);
          if (apiError.response) {
            logger.error(`API response data: ${JSON.stringify(apiError.response.data)}`);
            logger.error(`API response status: ${apiError.response.status}`);
          }
          throw apiError;
        }
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          const retryDelay = this.retryDelay * retryCount; // Increasing delay with each retry
          logger.warn(`Faucet claim attempt ${retryCount}/${maxRetries} failed: ${error.message}. Retrying in ${retryDelay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.error(`Faucet claim failed after ${maxRetries} attempts: ${error.message}`);
          return {
            success: false,
            error: error.message
          };
        }
      }
    }
    
    // If we get here, all retries failed
    return {
      success: false,
      error: `Failed to claim faucet after ${maxRetries} attempts`
    };
  }
}

module.exports = FaucetService;