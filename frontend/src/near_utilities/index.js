import untar from "js-untar"
import { SystemErrors, CID_RE  } from "@/utilities"
import { NFTStorage } from "nft.storage/dist/bundle.esm.min.js"

const attachedGas = "300000000000000"
const attachedTokens = "1"

import { initNewContract } from "@/nearConfig"

const API_KEY = process.env.VUE_APP_NFT_STORAGE_API_KEY

import { uploadtoIPFS} from "@/api"

const client = new NFTStorage({
  token: API_KEY,
})

// firstly, search among 3 main contracts
// if not found, init new Contract, for using change method
export function checkForContract(getters, minting_contract_id) {
  let findMainContract = null
  
  findMainContract = getters.getMainContracts.find((item) => item === minting_contract_id)
  
  if (findMainContract) {
    return [getters.getBundleContract, getters.getContract, getters.getEffectsContract].find((item) => item.contractId === findMainContract)
  }

  if (!findMainContract) {
    return initNewContract(minting_contract_id, this)
  }
}

// for creating new NFTs BY inputs FORM
export async function createUsualNFT(token_id, metadata, receiver_id, contract) {
  await contract
    .nft_mint({
      token_id,
      metadata,
      receiver_id,
    }, attachedGas, '100000000000000000000000')
}

export async function createBundleNFT(token_id, metadata, bundles, contract) {
  console.log(contract, 'contract')
  await contract
    .nft_bundle({
      token_id,
      metadata,
      bundles,
    }, attachedGas, '100000000000000000000000')
}

// for creating new NFTs BY inputs FORM
export async function unbundleNFT(token_id, contract) {
  await contract
    .nft_unbundle({
      token_id,
    }, attachedGas, attachedTokens)
}

export async function approveNFT(account_id, token_id, contract) {
  await contract
    .nft_approve({
      account_id,
      token_id,
    }, attachedGas, '700000000000000000000')
}

export async function sendNFT(receiver_id, token_data, contract) {
  console.log(receiver_id, token_data, contract, 'receiver_id, token_id, contract')
  // todo: possibly will need to change logic of urls revoking, discussable
  URL.revokeObjectURL(token_data.metadata.media_hash)

  await contract
    .nft_transfer({
      receiver_id,
      token_id: token_data.token_id,
      approval_id: 0,
      memo: 'NFT send',
    }, attachedGas, attachedTokens)
}

async function pushImageToIpfs(ipfsInstance, objectURL) {
  let cidV1 = ''
  let cid = ''
  let data = {
    name: 'test',
    description: 'test',
    image: null
  }

  const backIPFS = await uploadtoIPFS(objectURL)
  console.log(backIPFS, 'CIT uploadtoIPFS')

  await fetch(objectURL)
    .then(async (res) => {
      console.log(res, 'buffer res')
      data.image = await res.blob()
    })
  console.log(data, 'data pushImageToIpfs')
  cid = await client.store(data)
  console.log(cid, 'CIT pushImageToIpfs')
  let executedCID = CID_RE.exec(cid.data.image.href)?.[0]
  // currently saving only href on ipfs
  cidV1 = `https://${executedCID}.ipfs.nftstorage.link/blob`

  return cidV1
}

// async function pushObjectToIpfs(ipfsInstance, object) {
//   let cid = null
//   cid = await ipfsInstance.add(JSON.stringify(object))
//   return cid
// }

export async function deployNFTtoIPFS(ipfsInstance, imageURL, oldMeta, type) {
  let imageCID = null
  let meta = null

  try {
    imageCID = await pushImageToIpfs(ipfsInstance, imageURL, type)
    meta = JSON.parse(JSON.stringify(oldMeta))
    meta.animation_url = imageCID
  } catch(err) {
    console.log(err)
    throw SystemErrors.IPFS_SAVE
  }

  try {
    // await pushObjectToIpfs(ipfsInstance, meta)
    return imageCID
  } catch(err) {
    console.log(err)
    throw SystemErrors.IPFS_SAVE
  }
}

export async function getImageForTokenByURI(ipfsInstance, imageAddress) {
  let image
  if (imageAddress) {
    if (imageAddress.startsWith('ipfs') || imageAddress.startsWith('https://ipfs'))  {
      let cid = CID_RE.exec(imageAddress)?.[0]
      let localImageURL = await getImageFromIpfs(ipfsInstance, `${cid}/blob`)
      if (!localImageURL) {
        localImageURL = await getImageFromIpfs(ipfsInstance, cid)
      }
      image = localImageURL
    } else {
      image = imageAddress
    }
  }
  return image
}

async function getImageFromIpfs(ipfsInstance, cid) {
  let blob = null
  try {
    blob = await loadFileFromIPFS(ipfsInstance, cid, 6000)
  } catch (e) {
    console.log(e)
    throw SystemErrors.IPFS_GET_IMAGE
  }
  return blob ? URL.createObjectURL(blob) : null
}

async function loadFileFromIPFS(ipfs, cid, timeout) {
  if (cid === "" || cid === null || cid === undefined) {
    return
  }
  let content = []
  for await (const buff of ipfs.get(cid, {timeout})) {
    if (buff) {
      content.push(buff)
    }
  }
  let archivedBlob = new Blob(content, {type: "application/x-tar"})
  let archiveArrayBuffer = await archivedBlob.arrayBuffer()
  let archive = (await untar(archiveArrayBuffer))?.[0]

  return archive.blob
}