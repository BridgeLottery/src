console.log("Loaded")

let web3 = new Web3("wss://mainnet.infura.io/ws/v3/5b7465b67f684d79be59b0289fbb6ac9")

let hash = 0;

const subscriptionDurationInSeconds = 10;

let subscription = web3.eth
  .subscribe(
    "logs",
    {
      address: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1",
    },
    function (error, result) {
      if (!error) {
        web3.eth.getTransaction(result.transactionHash, (err, tx) => {
            if (tx) {
              if (hash !== tx.hash)
              {
                hash = tx.hash
                console.log("Gotten transaction")
				        console.log("Dépôt :", tx.value)
				        console.log("Expéditeur :", tx.from)
              }
            }
        })
      }
    }
  )
  .on("data", function (log) {
    console.log(log);
  });

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
