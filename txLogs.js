const axios = require('axios');
const depositorABI = require('./ABIjson/depositorAbi.json');
const { ethers } = require('ethers');
const fs = require('fs');
const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
const randomNumberABI = require('./ABIjson/randomNumberAbi.json');
const Web3 = require('web3');

// Read and parse the config.json file
const configPath = './config.json';
const configFile = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configFile);

let web3Url = config.web3Socket.replace('$web3Key', config.web3Key);
let web3 = new Web3(web3Url);

web3.eth.defaultAccount = config.fromAddress;
const depositorContract = new web3.eth.Contract(depositorABI, config.depositorContractAddress);
const subscriptionDurationInSeconds = 100;

let hash = 0;
let gasPriceRequested = false;
let suggestedGasPriceWei = 0;
let nonce = 0;

async function sendTransaction(txObject) {
    let signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);
    console.log("test")
    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    return receipt;
}

async function main() {
    nonce = await web3.eth.getTransactionCount(config.fromAddress);
    let lastGasPriceWei = 0;

    const subscription = web3.eth.subscribe(
        "logs",
        {
            address: config.eventAddress
        },
        async function (error, result) {
            if (!error) {
                try {
                    let tx = await web3.eth.getTransaction(result.transactionHash);
                    if (tx && tx.value && hash !== tx.hash) {
                        hash = tx.hash
                        console.log("Got transaction");
                        console.log("Dépôt:", tx.value);
                        console.log("Expéditeur:", tx.from);
                        if (!gasPriceRequested) {
                            suggestedGasPriceWei = await web3.eth.getGasPrice();
                            gasPriceRequested = true;
                        }
                        let estimatedGas = await depositorContract.methods.addAddress(tx.from, tx.value).estimateGas();

                        let txObject = {
                            nonce: nonce,
                            to: config.depositorContractAddress,
                            gasLimit: web3.utils.toHex(estimatedGas),
                            gasPrice: web3.utils.toHex(suggestedGasPriceWei),
                            value: "0x0",
                            data: depositorContract.methods.addAddress(tx.from, tx.value).encodeABI(),
                        };
                        nonce++;

                        if (suggestedGasPriceWei < lastGasPriceWei) {
                            suggestedGasPriceWei = lastGasPriceWei;
                        } else {
                            lastGasPriceWei = suggestedGasPriceWei;
                        }

                        let receipt = await sendTransaction(txObject);
                        console.log("Transaction Receipt:", receipt);
                    }
                } catch (error) {
                    console.log(error);
                }
            }
        }
    );

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
        const estimatedGas = await randomNumberContract.methods.requestRandomWords().estimateGas();
        const gasPrice = await web3.eth.getGasPrice();
        console.log(estimatedGas)
        console.log(gasPrice)
        nonce = await web3.eth.getTransactionCount(config.fromAddress);
        console.log("nonce", nonce)
            
        let txObject = {
            nonce: nonce,
            to: config.randomNumberContractAddress,
            //Adjust if needed
            gasLimit: web3.utils.toHex(estimatedGas * 10),
            gasPrice: web3.utils.toHex(gasPrice * 10),
            value: "0x0",
            data: randomNumberContract.methods.requestRandomWords().encodeABI(),
        };
        let signedTx = await web3.eth.accounts.signTransaction(txObject, config.privateKey);
        
        console.log(signedTx)
        let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        //let receipt = await sendTransaction(txObject);
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
main();
