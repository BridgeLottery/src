console.log("Loaded")

let web3 = new Web3("wss://mainnet.infura.io/ws/v3/InfuraAPIKey")

let hash = 0;

const subscriptionDurationInSeconds = 10;

let subscription = web3.eth.subscribe(
    "logs",
    {
        address: "0x636Af16bf2f682dD3109e60102b8E1A089FedAa8",
    },
     async function (error, result) {
        if (!error) {
            try 
            {
                const tx = await web3.eth.getTransaction(result.transactionHash); 
                if (tx && tx.value) 
                {
                    if (hash !== tx.hash) 
                    {
                        hash = tx.hash;
                        console.log("Gotten transaction");
                        console.log("Dépôt:", tx.value);
                        console.log("Expéditeur:", tx.from);

                        const txObject = 
                        {
                            nonce: nonce,
                            to: depositorContractAddress,
                            gasLimit: web3.utils.toHex(300000),
                            gasPrice: web3.utils.toHex(300000),
                            value: "0x0",
                            data: depositorContract.methods.addAddress(tx.from, tx.value).encodeABI(),
                        };
                        const signedTx = await web3.eth.accounts.signTransaction(txObject, privateKey);
                        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

                        console.log("Transaction Receipt:", receipt);
                    } 
        } 
            catch (error) 
            {
                console.error("Error:", error);
            }
        }
    }
);
setTimeout(() => {
    if (subscription) {
        subscription.unsubscribe((error, success) => {
            if (success) {
                console.log("Subscription unsubscribed.");
            } else {
                console.error("Error unsubscribing:", error);
            }
        });
    }
}, subscriptionDurationInSeconds * 1000);
