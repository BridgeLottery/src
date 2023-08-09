//Imports
const axios = require('axios');
const depositorABI = require('./ABIjson/depositorAbi.json');
const { ethers } = require('ethers');
const fs = require('fs');
const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
const randomNumberABI = require('./ABIjson/randomNumberAbi.json');
const Web3 = require('web3');
const configPath = './config.json';

//Read and parse the config.json file
const configFile = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configFile);
let depositorContract;
//Connection to goerli the network in our case
let web3Url = config.web3Socket.replace('$web3Key', config.web3Key);
let web3Sub = new Web3(web3Url);
//connection to sepolia network
web3Url = config.yourEndpointUrl.replace('$yourEndpointKey' , config.yourEndpointKey)
let web3 = new Web3(web3Url)

//Must be the address who deploy the contracts
web3.eth.defaultAccount = config.fromAddress;

//Tx hash
let hash;

//Transactions count
let nonce;

//Gas price
let estimatedGas;
let suggestedGasPrice;

//Subscription duration
const subscriptionDurationInSeconds = 120;

//Deploy a new contract
const deploy = async () => {
    const nonce = await web3.eth.getTransactionCount(config.fromAddress);
    
    const deployTransaction = {
        from: config.fromAddress,
        data: config.contractBytecode,
        nonce: nonce,
        gas: web3.utils.toHex(5000000), // Adjust the gas limit as needed
        gasPrice: await web3.eth.getGasPrice(), // Adjust gas price as needed
    };
    
    const signedTransaction = await web3.eth.accounts.signTransaction(deployTransaction, config.privateKey);
    const contract = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
    console.log('Contract deployed at:', contract.contractAddress);
    return contract.contractAddress; // Return the deployed contract address
};

deploy().then(deployedContractAddress => {
    // Create a contract instance
    depositorContract = new web3.eth.Contract(depositorABI, deployedContractAddress);
    main();
}).catch(error => {
    console.error('Error deploying contract:', error);
});

//Sign and send the transaction to the network
async function sendTransaction(txObject) {
    let signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);
    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log("Transaction Receipt:", receipt);
}

async function main() {
    //Subscribe to contract event
    const subscription = web3Sub.eth.subscribe(
        "logs",
        {
            address: config.eventAddress
        },
        async function (error, result) {
            if (!error) {
                try {
                    //Recover data from the transaction
                    console.log("test")
                    let tx = await web3Sub.eth.getTransaction(result.transactionHash);
                    //Verify that each transaction is used once
                    //Verify that the transaction have a non-zero value
                    if (tx && tx.value && hash !== tx.hash) {
                        hash = tx.hash
                        console.log("Got transaction");
                        console.log("Dépôt:", tx.value);
                        console.log("Expéditeur:", tx.from);

                        //Get the gas price
                        suggestedGasPrice = await web3.eth.getGasPrice();
                        console.log(suggestedGasPrice)
                        //Get the estimated gas 
                        estimatedGas = await depositorContract.methods.addAddress(tx.from, tx.value).estimateGas();
                        //Recover the current transactions count of the input address
                        nonce = await web3.eth.getTransactionCount(config.fromAddress);

                        //Set up the txObject
                        let txObject = {
                            nonce: nonce,
                            to: depositorContract.options.address,
                            gasLimit: web3.utils.toHex(estimatedGas),
                            gasPrice: web3.utils.toHex(suggestedGasPrice),
                            value: "0x0",
                            data: depositorContract.methods.addAddress(tx.from, tx.value).encodeABI(),
                        };
                        //nonce++;
                        await sendTransaction(txObject);
                        }
                    }
                    catch (error) {
                        console.log(error);}

                }
                else {
                    console.log(error);}
            }
            );
//Set the duration of the subscription
setTimeout(async () => {
        if (subscription) {
            subscription.unsubscribe((error, success) => {
                if (success) {
                    console.log("Subscription unsubscribed.");
                    getRandomNumber();
                } else {
                    console.error("Error unsubscribing:", error);
                }
            });
        }
    }, subscriptionDurationInSeconds * 1000);
}

async function getRandomNumber() {
    try {

        web3Url = config.yourEndpointUrl.replace('$yourEndpointKey' , config.yourEndpointKey)
        web3 = new Web3(web3Url);
        const randomNumberContract = new web3.eth.Contract(randomNumberABI, config.randomNumberContractAddress);
        estimatedGas = await randomNumberContract.methods.requestRandomWords().estimateGas();
        gasPrice = await web3.eth.getGasPrice();
        nonce = await web3.eth.getTransactionCount(config.fromAddress);
        
        console.log("estimatedGas", estimatedGas)
        console.log("Gas price :", gasPrice)
        console.log("nonce", nonce)
            
        let txObject = {
            nonce: nonce,
            to: config.randomNumberContractAddress,

            //@dev Adjust config.gasLimitModifier and config.gasPriceModifier if needed
            gasLimit: web3.utils.toHex(estimatedGas * config.gasLimitModifier),
            gasPrice: web3.utils.toHex(gasPrice * config.gasPriceModifier),
            value: "0x0",
            data: randomNumberContract.methods.requestRandomWords().encodeABI(),
        };
        let signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);
        
        console.log(signedTx)
        let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log("Random Number Transaction Receipt:", receipt);
        let RequestID = await randomNumberContract.methods.lastRequestId().call()
        console.log(RequestID)

        let result = await randomNumberContract.methods.getRequestStatus(RequestID).call();
        while (!result.fulfilled) {
            result = await randomNumberContract.methods.getRequestStatus(RequestID).call();
        }
        let index = await depositorContract.methods.index().call()
        console.log(index)
        console.log(result.randomWords)
        let rn = result.randomWords[0] % index
        console.log(rn)
        let winner = await depositorContract.methods.integerToAddress(rn).call()
        console.log("Winner is:", winner);
        createAttestation(winner);
    } catch (error) {
        console.error("Error:", error);
    }
}

async function createAttestation(winner) {

    const eas = new EAS(config.easContractAddress);
    const provider = ethers.getDefaultProvider(web3Url)
    const signer = new ethers.Wallet(config.privateKey, provider);

    eas.connect(signer);
    
    const schemaEncoder = new SchemaEncoder("bool win");

    const encodedData = schemaEncoder.encodeData([
        { name: "win", value: false, type: "bool" },
    ]);

    const tx = await eas.attest({
        schema: config.schemaUID,
        data: {
            recipient: winner,
            expirationTime: 0,
            revocable: true,
            data: encodedData,
        },
    });

    const newAttestationUID = await tx.wait();

    console.log("New attestation UID:", newAttestationUID);
}
