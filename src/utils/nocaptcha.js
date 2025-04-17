const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const logger = require('./logger');

class NoCaptcha {
  constructor(userToken, proxy = null) {
    this.userToken = userToken;
    this.baseUrl = 'http://api.nocaptcha.io';
    this.proxy = this._formatProxy(proxy);
    
    // Setup axios client with proxy if provided
    const config = {
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        'User-Token': this.userToken,
        'Content-Type': 'application/json',
        'Developer-Id': 'vSwmGE',
      }
    };
    
    if (this.proxy) {
      const httpsAgent = new HttpsProxyAgent(this.proxy);
      const httpAgent = new HttpProxyAgent(this.proxy);
      config.httpsAgent = httpsAgent;
      config.httpAgent = httpAgent;
      logger.info(`NoCaptcha initialized with proxy: ${this.proxy.replace(/\/\/.*@/, '//***@')}`);
    } else {
      logger.info('NoCaptcha initialized without proxy');
    }
    
    this.client = axios.create(config);
  }

_formatProxy(proxy) {
    if (!proxy) {
      return null;
    }
    
    // If it already has authentication or is in URL format, return as is
    if (proxy.includes('@') || proxy.startsWith('http')) {
      return proxy;
    }
    
    // Format as http proxy if it's just IP:PORT
    return `http://${proxy}`;
  }
  
  // Extract region from proxy URL if possible
  _extractRegion(proxy) {
    if (!proxy) return null;
    
    // Check for country code in the proxy URL
    // Common patterns: geo-as.iproyal.vip (Asia), geo-eu (Europe), etc.
    // Or explicit country in URL or username like: country-SG, _country-US, etc.
    
    const regionMap = {
      'sg': 'sg',
      'hk': 'hk',
      'us': 'us',
      'uk': 'uk',
      'jp': 'jp',
      'kr': 'kr',
      'eu': 'uk', // Default European proxies to UK
      'as': 'sg'  // Default Asian proxies to Singapore
    };
    
    let region = null;
    
    // Try to find country code in the proxy string
    const lowerProxy = proxy.toLowerCase();
    
    // Check for country in user-country-XX pattern
    const countryMatch = lowerProxy.match(/country-([a-z]{2})/i);
    if (countryMatch && countryMatch[1]) {
      const countryCode = countryMatch[1].toLowerCase();
      return regionMap[countryCode] || countryCode;
    }
    
    // Check for geographic regions in domain
    if (lowerProxy.includes('geo-as') || lowerProxy.includes('-as.')) {
      return 'sg';
    } else if (lowerProxy.includes('geo-eu') || lowerProxy.includes('-eu.')) {
      return 'uk';
    } else if (lowerProxy.includes('geo-us') || lowerProxy.includes('-us.')) {
      return 'us';
    }
    
    // Default region based on common proxy patterns
    Object.keys(regionMap).forEach(code => {
      if (lowerProxy.includes(`.${code}.`) || lowerProxy.includes(`-${code}.`)) {
        region = regionMap[code];
      }
    });
    
    return region;
  }

  async solveHCaptcha(sitekey, referer, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        const data = {
          sitekey,
          referer,
          invisible: options.invisible || false,
          need_ekey: options.needEkey || false,
        };

        if (options.rqdata) {
          data.rqdata = options.rqdata;
        }

        if (options.domain) {
          data.domain = options.domain;
        }

        if (this.proxy) {
          data.proxy = this.proxy;
          
          // Extract region from proxy URL or use provided region
          const region = options.region || this._extractRegion(this.proxy) || 'sg';
          data.region = region;
          
          logger.info(`Using proxy region: ${region}`);
        }

        if (retryCount > 0) {
          logger.info(`Retry #${retryCount} - Attempting to solve hCaptcha for ${referer}`);
        } else {
          logger.info(`Attempting to solve hCaptcha for ${referer}`);
        }
        
        //logger.info(`NoCaptcha request payload: ${JSON.stringify(data, null, 2)}`);
        
        try {
          const response = await this.client.post('/api/wanda/hcaptcha/universal', data);
          //logger.info(`NoCaptcha raw response: ${JSON.stringify(response.data, null, 2)}`);
          
          const result = response.data;

          if (result.status === 1) {
            logger.info('Successfully solved hCaptcha');
            
            // Important: NoCaptcha.io returns the token in generated_pass_UUID, not in response field
            if (!result.data) {
              logger.error('NoCaptcha response missing data field');
              throw new Error('NoCaptcha response missing data field');
            }
            
            // Normalize response format to have both properties
            const normalizedResponse = {
              ...result.data,
              // Make sure response field is available for backward compatibility
              response: result.data.generated_pass_UUID
            };
            
            logger.info(`Got hCaptcha token (first 30 chars): ${normalizedResponse.response.substring(0, 30)}...`);
            
            return normalizedResponse;
          } else {
            throw new Error(`Error solving hCaptcha: ${JSON.stringify(result)}`);
          }
        } catch (apiError) {
          logger.error(`NoCaptcha API error: ${apiError.message}`);
          if (apiError.response) {
            logger.error(`NoCaptcha API response data: ${JSON.stringify(apiError.response.data)}`);
            logger.error(`NoCaptcha API response status: ${apiError.response.status}`);
          }
          throw apiError;
        }
      } catch (error) {
        lastError = error;
        retryCount++;
        
        if (retryCount < maxRetries) {
          const retryDelay = 3000 * retryCount; // Increasing delay with each retry
          logger.warn(`hCaptcha solve failed (attempt ${retryCount}/${maxRetries}): ${error.message}. Retrying in ${retryDelay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.error(`Failed to solve hCaptcha after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('Failed to solve hCaptcha after multiple attempts');
  }
}

module.exports = NoCaptcha;