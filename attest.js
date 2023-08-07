import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from 'ethers';
import config from './config.mjs';
export const EASContractAddress = config.EASContractAddress;

async function createAttestation()
{

  //Address of eas deployement contract
  const eas = new EAS(EASContractAddress);
  //Node provider
  const provider = ethers.getDefaultProvider(config.apiUrl)
  //Wallet to sign transaction
  const signer = new ethers.Wallet(config.privateKey, provider);
  
  eas.connect(signer);  

  const schemaEncoder = new SchemaEncoder("bool win");

  const encodedData = schemaEncoder.encodeData([
    { name: "win", value: false, type: "bool" },
  ]);

  const tx = await eas.attest({
    schema: config.schemaUID,
    data: {
      recipient: "",
      expirationTime: 0,
      revocable: true,
      data: encodedData,
    },
  });

  const newAttestationUID = await tx.wait();

  console.log("New attestation UID:", newAttestationUID);
}
createAttestation();
