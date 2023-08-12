//FOR FRONT
const express = require('express');
const cors = require('cors');
//Imports
const axios = require('axios');
const depositorABI = require('./ABIjson/depositorAbi.json');
const { ethers } = require('ethers');
const fs = require('fs');
const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
const randomNumberABI = require('./ABIjson/randomNumberAbi.json');
const Web3 = require('web3');
const configPath = './config2.json';
const zoraAbi = require('./ABIjson/zoraDropAbi.json')

//Read and parse the config.json file
const configFile = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configFile);
let depositorContract;
//Connection to goerli the network in our case
let web3Url = config.web3Socket.replace('$web3Key', config.web3Key);
let web3Sub = new Web3(web3Url);
//connection to sepolia network
web3Url = config.yourEndpointUrl.replace('$yourEndpointKey', config.yourEndpointKey)
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
let subscriptionDurationInSeconds = 60;

//FOR FRONT
const app = express();
app.use(cors());
let winner = 'No winner yet!';

//Deploy a new contract
const deploy = async () => {
    console.log("Contract in deployment...")
    const nonce = await web3.eth.getTransactionCount(config.fromAddress);
    const deployTransaction = {
        from: config.fromAddress,
        data: config.contractBytecode,
        nonce: nonce,
        gasPrice: await web3.eth.getGasPrice() * config.gasPriceModifier, // Adjust gas price as needed
    };
    try {
        estimatedGas = await web3.eth.estimateGas(deployTransaction);
        deployTransaction.gas = estimatedGas * config.gasLimitModifier; // Set the gas limit based on the estimation
    } catch (error) {
        console.error('Error estimating gas:', error);
        return;
    }
    const signedTransaction = await web3.eth.accounts.signTransaction(deployTransaction, config.privateKey);
    const contract = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
    console.log('Contract depositor.sol deployed at:', contract.contractAddress);
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
        console.log("Subscription subscribed."),
        async function (error, result) {
            if (!error) {
                try {
                    //Recover data from the transaction
                    let tx = await web3Sub.eth.getTransaction(result.transactionHash);
                    //Verify that each transaction is used once
                    //Verify that the transaction have a non-zero value
                    if (tx && tx.value != 0 && hash !== tx.hash) {
                        hash = tx.hash
                        console.log("Transaction intercepted");
                        console.log("Bridged amount:", tx.value);
                        console.log("Expeditor:", tx.from);

                        //Get the gas price
                        suggestedGasPrice = await web3.eth.getGasPrice();
                        console.log("Suggested Gas Price is :", suggestedGasPrice)
                        //Get the estimated gas 
                        estimatedGas = await depositorContract.methods.addAddress(tx.from, tx.value).estimateGas();
                        console.log("estimatedGas is :", estimatedGas)
                        //Recover the current transactions count of the input address
                        nonce = await web3.eth.getTransactionCount(config.fromAddress);

                        //Set up the txObject
                        let txObject = {
                            nonce: nonce,
                            to: depositorContract.options.address,
                            gasLimit: web3.utils.toHex(estimatedGas * config.gasLimitModifier2),
                            gasPrice: web3.utils.toHex(suggestedGasPrice * config.gasPriceModifier2),
                            value: "0x0",
                            data: depositorContract.methods.addAddress(tx.from, tx.value).encodeABI(),
                        };
                        //nonce++;
                        await sendTransaction(txObject);
                    }
                }
                catch (error) {
                    console.log(error);
                }

            }
            else {
                console.log(error);
            }
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

        web3Url = config.yourEndpointUrl.replace('$yourEndpointKey', config.yourEndpointKey)
        web3 = new Web3(web3Url);
        const randomNumberContract = new web3.eth.Contract(randomNumberABI, config.randomNumberContractAddress);
        estimatedGas = await randomNumberContract.methods.requestRandomWords().estimateGas();
        gasPrice = await web3.eth.getGasPrice();
        nonce = await web3.eth.getTransactionCount(config.fromAddress);

        console.log("estimatedGas is", estimatedGas)
        console.log("Gas price is:", gasPrice)
        console.log("nonce is", nonce)

        let txObject = {
            nonce: nonce,
            to: config.randomNumberContractAddress,

            //@dev Adjust config.gasLimitModifier and config.gasPriceModifier if needed
            gasLimit: web3.utils.toHex(estimatedGas * config.gasLimitModifier3),
            gasPrice: web3.utils.toHex(gasPrice * config.gasPriceModifier3),
            value: "0x0",
            data: randomNumberContract.methods.requestRandomWords().encodeABI(),
        };
        let signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);

        console.log("Signed Tx is :", signedTx)
        let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log("Random Number Transaction Receipt:", receipt);
        let RequestID = await randomNumberContract.methods.lastRequestId().call()
        console.log("RequestID is:", RequestID)

        let result = await randomNumberContract.methods.getRequestStatus(RequestID).call();
        while (!result.fulfilled) {
            result = await randomNumberContract.methods.getRequestStatus(RequestID).call();
        }
        let index = await depositorContract.methods.index().call()
        console.log("current index is :", index)
        console.log("Random Number is :", result.randomWords)
        //  if (index !== 0){
        let rn = result.randomWords[0] % index
        console.log("Random winning number is", rn)
        //FOR FRONT
        winner = await depositorContract.methods.integerToAddress(rn).call();
        //
        console.log("Corresponding Winner is:", winner);
        console.log("Creation of attestation for winner...");
        console.log("Minting of NFT for winner...");
        createAttestation(winner);
        sendNft(winner);
        //FOR FRONT
        return winner;
        //
        // }
        // else {
        //     console.log("No winner ;/")
        //   }

    } catch (error) {
        console.error("Error:", error);
        //FOR FRONT
        return 'No winner yet!';
        //
    }
}

async function createAttestation(winner) {

    const eas = new EAS(config.easContractAddress);
    const web3Url = config.yourEndpointUrl.replace('$yourEndpointKey', config.yourEndpointKey)
    const provider = ethers.getDefaultProvider(web3Url)
    const signer = new ethers.Wallet(config.privateKey, provider);

    eas.connect(signer);

    const schemaEncoder = new SchemaEncoder("bool Winner, string Network, string Type");

    const encodedData = schemaEncoder.encodeData([
        { name: "Winner", value: true, type: "bool" },
        { name: "Network", value: "SEPOLIA", type: "string" },
        { name: "Type", value: "TESTNET", type: "string" },
    ]);

    const tx = await eas.attest({
        schema: config.schemaUID,
        data: {
            recipient: winner,
            expirationTime: 0,
            revocable: false,
            data: encodedData,
            value: 0,
        },
    });
    const newAttestationUID = await tx.wait();
    console.log("New attestation UID to winner is:", newAttestationUID);
    console.log("Lottery is over, thanks to all participants! 🏆");
}

async function sendNft(winner) {

    const web3 = new Web3(config.collectionProvider);
    web3.eth.defaultAccount = config.fromAddress;
    const suggestedGasPrice = await web3.eth.getGasPrice();
    //console.log(suggestedGasPrice)
    const contract = new web3.eth.Contract(zoraAbi, config.collection)
    const estimatedGas = await contract.methods.adminMint(winner, 1).estimateGas();
    //console.log("test")
    const nonce = await web3.eth.getTransactionCount(config.fromAddress);
    try {
        const txObject = {
            nonce: nonce,
            to: config.collection,
            gasLimit: web3.utils.toHex(estimatedGas * config.gasLimitModifier4),
            gasPrice: web3.utils.toHex(suggestedGasPrice * config.gasPriceModifier4),
            value: "0x0",
            data: contract.methods.adminMint(winner, 1).encodeABI(),
        };

        const signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log("Transaction Hash of NFT minted to winner:", receipt.transactionHash);
    }
    catch (error) {
        console.log(error)
    }
}

//FOR FRONT
app.get('/getInfos', (req, res) => {
    try {
        res.json({ subscriptionDurationInSeconds, winner });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch variable value' });
    }
});
//
//FOR FRONT
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Node.js server is running on port ${port}`);
    setInterval(() => {
        subscriptionDurationInSeconds = Math.max(0, subscriptionDurationInSeconds - 1);
    }, 1000);
});
