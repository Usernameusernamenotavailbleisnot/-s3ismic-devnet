const solc = require('solc');
const logger = require('../utils/logger');

class ContractGenerator {
  constructor() {
    this.contractName = 'MultiFunction';
  }

  // Generate a contract with many functions for interaction
  generateContractSource(functionCount = 100) {
    logger.info(`Generating contract with ${functionCount} functions`);
    
    // Track which utility functions we need to include
    const utilityFunctions = new Set();
    
    let contractSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ${this.contractName} {
    uint256 private value;
    mapping(string => uint256) private namedValues;
    mapping(address => uint256) private userValues;
    string[] private keys;
    address public owner;
    
    event ValueChanged(uint256 oldValue, uint256 newValue, address indexed changer);
    event NamedValueChanged(string key, uint256 oldValue, uint256 newValue);
    event UserValueChanged(address user, uint256 oldValue, uint256 newValue);
    
    constructor(uint256 initialValue) {
        value = initialValue;
        owner = msg.sender;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
    
    function setValue(uint256 newValue) public {
        uint256 oldValue = value;
        value = newValue;
        emit ValueChanged(oldValue, newValue, msg.sender);
    }
    `;

    // Function types for diversity (omit 'store' from initial list to control its frequency)
    const functionTypes = [
      'increment', 'decrement', 'multiply', 'divide', 'power', 
      'add', 'subtract', 'set', 'get', 'toggle', 'update', 
      'push', 'pop', 'shift', 'unshift', 'calculate',
      'retrieve', 'compare', 'max', 'min', 'average', 'reset',
      'approve', 'burn', 'mint', 'swap', 'lock'
    ];
    
    // Limit complex functions that might use utility functions to avoid duplicates
    const complexFunctionTypes = ['store'];
    // Only allow a small number of complex functions
    const maxComplexFunctions = 3;
    
    // Nouns for function naming
    const nouns = [
      'Value', 'Counter', 'Number', 'Amount', 'Total', 'Balance', 
      'Score', 'Point', 'Quantity', 'Sum', 'Product', 'Difference',
      'Data', 'Token', 'Asset', 'Share', 'Unit', 'Record', 'Item',
      'Element', 'Position', 'State', 'Status', 'Limit', 'Threshold'
    ];
    
    // Modifiers for function naming
    const modifiers = [
      'Max', 'Min', 'Average', 'Current', 'Previous', 'Next', 
      'First', 'Last', 'Primary', 'Secondary', 'Global', 'Local',
      'User', 'Admin', 'Public', 'Private', 'System', 'Custom',
      'Temporary', 'Permanent', 'Shared', 'Personal', 'Daily', 'Total'
    ];
    
    const usedFunctionNames = new Set();
    
    // Track complex function count
    let complexFunctionCount = 0;
    
    for (let i = 0; i < functionCount; i++) {
      // Decide whether to use a complex function (if we haven't used too many)
      let functionType;
      if (complexFunctionCount < maxComplexFunctions && Math.random() < 0.1) {
        // 10% chance of using complex function if we haven't reached the limit
        functionType = complexFunctionTypes[Math.floor(Math.random() * complexFunctionTypes.length)];
        complexFunctionCount++;
      } else {
        // Regular function type
        functionType = functionTypes[Math.floor(Math.random() * functionTypes.length)];
      }
      
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
      
      let functionName = `${functionType}${modifier}${noun}`;
      
      // Ensure no duplicate function names
      if (usedFunctionNames.has(functionName)) {
        functionName = `${functionName}${i}`;
      }
      usedFunctionNames.add(functionName);
      
      // Generate function implementation based on type
      let functionCode = '';
      
      if (functionType === 'increment') {
        functionCode = `
    function ${functionName}(uint256 amount) public {
        uint256 oldValue = value;
        value += amount;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'decrement') {
        functionCode = `
    function ${functionName}(uint256 amount) public {
        uint256 oldValue = value;
        require(value >= amount, "Value would be negative");
        value -= amount;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'multiply') {
        functionCode = `
    function ${functionName}(uint256 factor) public {
        uint256 oldValue = value;
        value *= factor;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'divide') {
        functionCode = `
    function ${functionName}(uint256 divisor) public {
        require(divisor > 0, "Cannot divide by zero");
        uint256 oldValue = value;
        value /= divisor;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'power') {
        functionCode = `
    function ${functionName}(uint256 exponent) public {
        uint256 oldValue = value;
        uint256 result = 1;
        uint256 base = value;
        for (uint i = 0; i < exponent; i++) {
            result *= base;
        }
        value = result;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'set') {
        functionCode = `
    function ${functionName}(string memory key, uint256 newValue) public {
        uint256 oldValue = namedValues[key];
        namedValues[key] = newValue;
        if (oldValue == 0 && newValue != 0) {
            keys.push(key);
        }
        emit NamedValueChanged(key, oldValue, newValue);
    }`;
      } else if (functionType === 'get') {
        functionCode = `
    function ${functionName}(string memory key) public view returns (uint256) {
        return namedValues[key];
    }`;
      } else if (functionType === 'toggle') {
        functionCode = `
    function ${functionName}() public {
        uint256 oldValue = value;
        value = value > 0 ? 0 : 1;
        emit ValueChanged(oldValue, value, msg.sender);
    }`;
      } else if (functionType === 'update') {
        functionCode = `
    function ${functionName}(address user, uint256 newValue) public {
        uint256 oldValue = userValues[user];
        userValues[user] = newValue;
        emit UserValueChanged(user, oldValue, newValue);
    }`;
      } else if (functionType === 'push') {
        functionCode = `
    function ${functionName}(string memory key) public {
        keys.push(key);
    }`;
      } else if (functionType === 'pop') {
        functionCode = `
    function ${functionName}() public {
        require(keys.length > 0, "No keys to remove");
        keys.pop();
    }`;
      } else if (functionType === 'store') {
        // Mark that we need these utility functions
        utilityFunctions.add('toString');
        
        functionCode = `
    function ${functionName}(address user, string memory key, uint256 amount) public {
        namedValues[string(abi.encodePacked(key, toString(user)))] = amount;
    }`;
      } else if (functionType === 'retrieve') {
        functionCode = `
    function ${functionName}(string memory key) public view returns (uint256) {
        uint256 total = 0;
        for (uint i = 0; i < keys.length; i++) {
            if (keccak256(bytes(keys[i])) == keccak256(bytes(key))) {
                total += namedValues[keys[i]];
            }
        }
        return total;
    }`;
      } else if (functionType === 'compare') {
        functionCode = `
    function ${functionName}(uint256 a, uint256 b) public pure returns (int8) {
        if (a > b) return 1;
        if (a < b) return -1;
        return 0;
    }`;
      } else if (functionType === 'max') {
        functionCode = `
    function ${functionName}(uint256 a, uint256 b) public pure returns (uint256) {
        return a > b ? a : b;
    }`;
      } else if (functionType === 'min') {
        functionCode = `
    function ${functionName}(uint256 a, uint256 b) public pure returns (uint256) {
        return a < b ? a : b;
    }`;
      } else if (functionType === 'average') {
        functionCode = `
    function ${functionName}(uint256 a, uint256 b) public pure returns (uint256) {
        return (a + b) / 2;
    }`;
      } else if (functionType === 'reset') {
        functionCode = `
    function ${functionName}() public {
        uint256 oldValue = value;
        value = 0;
        emit ValueChanged(oldValue, 0, msg.sender);
    }`;
      } else if (functionType === 'transfer') {
        // Removing this function as requested
        functionCode = `
    function ${functionName}(address to, uint256 amount) public {
        // Simple state change without ETH transfer
        namedValues[string(abi.encodePacked("transfer_", toString(to)))] = amount;
        emit NamedValueChanged("transfer", 0, amount);
    }`;
      } else if (functionType === 'swap') {
        functionCode = `
    function ${functionName}(string memory key1, string memory key2) public {
        uint256 temp = namedValues[key1];
        namedValues[key1] = namedValues[key2];
        namedValues[key2] = temp;
    }`;
      } else {
        // Default function for any other type
        functionCode = `
    function ${functionName}(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }`;
      }
      
      contractSource += functionCode;
    }
    
    // Add utility functions at the end if needed
    if (utilityFunctions.has('toString')) {
      contractSource += `
    // Utility functions
    function toString(address account) internal pure returns(string memory) {
        return toString(abi.encodePacked(account));
    }
    
    function toString(bytes memory data) internal pure returns(string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint i = 0; i < data.length; i++) {
            str[2+i*2] = alphabet[uint(uint8(data[i] >> 4))];
            str[3+i*2] = alphabet[uint(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }`;
    }
    
    // Close the contract
    contractSource += `
}`;

    return contractSource;
  }

  compileContract(source) {
    logger.info('Compiling contract...');
    
    const input = {
      language: 'Solidity',
      sources: {
        'contract.sol': {
          content: source
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode']
          }
        }
      }
    };
    
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    // Check for errors
    if (output.errors) {
      const hasError = output.errors.some(error => error.type === 'Error');
      if (hasError) {
        const errorMessages = output.errors.map(e => e.message).join('\n');
        throw new Error(`Compilation error: ${errorMessages}`);
      } else {
        logger.warn(`Compilation warnings: ${JSON.stringify(output.errors)}`);
      }
    }
    
    const contractOutput = output.contracts['contract.sol'][this.contractName];
    
    return {
      abi: contractOutput.abi,
      bytecode: contractOutput.evm.bytecode.object
    };
  }
}

module.exports = ContractGenerator;