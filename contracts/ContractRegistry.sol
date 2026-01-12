// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ContractRegistry {
    struct DeployedContract {
        string name;
        address contractAddress;
        string network;
        uint256 timestamp;
        bytes32 txHash;
        address deployer;
    }

    // Mapping from user address to their deployed contracts
    mapping(address => DeployedContract[]) private userContracts;

    // Mapping to track contract ownership for verification
    mapping(address => address) private contractToOwner;

    // Events
    event ContractRegistered(
        address indexed deployer,
        address indexed contractAddress,
        string name,
        string network,
        bytes32 txHash,
        uint256 timestamp
    );

    event ContractUpdated(
        address indexed deployer,
        address indexed contractAddress,
        string newName
    );

    // Modifiers
    modifier onlyContractOwner(address contractAddress) {
        require(
            contractToOwner[contractAddress] == msg.sender,
            "Not the contract owner"
        );
        _;
    }

    modifier contractExists(address contractAddress) {
        require(
            contractToOwner[contractAddress] != address(0),
            "Contract not registered"
        );
        _;
    }

    /**
     * @dev Register a newly deployed contract
     * @param name The name given to the contract by the user
     * @param contractAddress The deployed contract address
     * @param network The network name where contract was deployed
     * @param txHash The transaction hash of the deployment
     */
    function registerContract(
        string memory name,
        address contractAddress,
        string memory network,
        bytes32 txHash
    ) external {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(contractAddress != address(0), "Invalid contract address");
        require(bytes(network).length > 0, "Network cannot be empty");
        require(txHash != bytes32(0), "Invalid transaction hash");

        // Check if contract is already registered
        require(
            contractToOwner[contractAddress] == address(0),
            "Contract already registered"
        );

        // Create new contract entry
        DeployedContract memory newContract = DeployedContract({
            name: name,
            contractAddress: contractAddress,
            network: network,
            timestamp: block.timestamp,
            txHash: txHash,
            deployer: msg.sender
        });

        // Store the contract
        userContracts[msg.sender].push(newContract);
        contractToOwner[contractAddress] = msg.sender;

        emit ContractRegistered(
            msg.sender,
            contractAddress,
            name,
            network,
            txHash,
            block.timestamp
        );
    }

    /**
     * @dev Update the name of a registered contract
     * @param contractAddress The contract address to update
     * @param newName The new name for the contract
     */
    function updateContractName(
        address contractAddress,
        string memory newName
    ) external contractExists(contractAddress) onlyContractOwner(contractAddress) {
        require(bytes(newName).length > 0, "Name cannot be empty");

        // Find and update the contract
        DeployedContract[] storage contracts = userContracts[msg.sender];
        for (uint256 i = 0; i < contracts.length; i++) {
            if (contracts[i].contractAddress == contractAddress) {
                contracts[i].name = newName;
                emit ContractUpdated(msg.sender, contractAddress, newName);
                return;
            }
        }
    }

    /**
     * @dev Get all contracts deployed by a user
     * @param user The address of the user
     * @return Array of deployed contracts
     */
    function getUserContracts(
        address user
    ) external view returns (DeployedContract[] memory) {
        return userContracts[user];
    }

    /**
     * @dev Get contracts deployed by the caller
     * @return Array of deployed contracts
     */
    function getMyContracts() external view returns (DeployedContract[] memory) {
        return userContracts[msg.sender];
    }

    /**
     * @dev Get a specific contract by address
     * @param contractAddress The contract address to query
     * @return The contract details
     */
    function getContract(
        address contractAddress
    ) external view contractExists(contractAddress) returns (DeployedContract memory) {
        address owner = contractToOwner[contractAddress];
        DeployedContract[] memory contracts = userContracts[owner];

        for (uint256 i = 0; i < contracts.length; i++) {
            if (contracts[i].contractAddress == contractAddress) {
                return contracts[i];
            }
        }

        revert("Contract not found");
    }

    /**
     * @dev Get the owner of a contract
     * @param contractAddress The contract address to query
     * @return The owner address
     */
    function getContractOwner(
        address contractAddress
    ) external view contractExists(contractAddress) returns (address) {
        return contractToOwner[contractAddress];
    }

    /**
     * @dev Get total number of contracts deployed by a user
     * @param user The address of the user
     * @return The count of contracts
     */
    function getUserContractCount(address user) external view returns (uint256) {
        return userContracts[user].length;
    }

    /**
     * @dev Get total number of contracts deployed by caller
     * @return The count of contracts
     */
    function getMyContractCount() external view returns (uint256) {
        return userContracts[msg.sender].length;
    }

    /**
     * @dev Check if a contract is registered
     * @param contractAddress The contract address to check
     * @return True if registered, false otherwise
     */
    function isContractRegistered(
        address contractAddress
    ) external view returns (bool) {
        return contractToOwner[contractAddress] != address(0);
    }
}