import { Router } from 'express'
const router = Router();
import config from '../config'
const Web3 = require('web3')
import mysqlPromise from 'mysql2/promise'
const abi = require('../lib/abi').abi
const WalletFactory = require('../lib/wallet').WalletFactory
let _walletFactory = new WalletFactory(config.wallet.mnemonics, config.wallet.password, config.wallet.network)


const pool = mysqlPromise.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  //  port: config.db.port,
  database: config.db.dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

/* GET home page. */
router.get('/depositAddress', async (req, res, next) => {
  try {
    let { userId } = req.query
    let [rows, fields] = await pool.query("SELECT address from bnbAddresses WHERE `userId` = ?", [userId])
    let result
       console.log("test",rows)
    if (rows.length == 0) {
      //let { address } = await tronLib.getAccountAtIndex(userId)
      let address = await getAccountAtIndex(userId)
      console.log("address", address)

      await pool.query('INSERT IGNORE INTO bnbAddresses (address, addressHex, userId) VALUES (?, ?, ?)', [address, address, userId])
      result = address

    } else { result = rows[0].address }

    res.send({
      status: true,
      address: result
    })

  } catch (error) {
    console.log(error)
    res.status(500).send({
      status: false,
      message: 'Error occurred'
    })
  }
})

router.get('/getBalance', async (req, res, next) => {
  try {
    let { address } = req.query
    const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
    let balance = await web3.eth.getBalance(address)
    console.log(balance)
    let bnbbalance = Number(balance)/10**18
    res.send({
      status: true,
      address: address,
      balance: bnbbalance
    })

  } catch (error) {
    console.log(error)
    res.status(500).send({
      status: false,
      message: error.message
    })
  }
})

router.post('/send', async (req, res, next) => {
  try {
    let { receiver, amount } = req.body

    //let receipt = await tronLib.sendTrx(receiver, Number(amount) * 10 ** 6)
    await sendTrx(receiver, Number(amount), res)


  } catch (error) {
    console.log(error)
    res.status(500).send({
      status: false,
      message: 'Error occurred'
    })
  }
})

router.post('/userSend', async (req, res, next) => {
  try {
    let { sender, receiver, amount } = req.body
    let [rows, fields] = await pool.query("SELECT userId from bnbAddresses WHERE `address` = ?", [sender])
    if (rows.length == 0) {
      res.send({
        status: "false",
        message: "Sender address not in db"
      })
    } else {
      console.log("test", rows)
      let userId = rows[0].userId
      console.log("req.body", req.body)
      await userSendTrx(userId, sender, receiver, Number(amount), res)
    }


  } catch (error) {
    console.log(error)
    res.status(500).send({
      status: "false",
      message: 'Error occurred'
    })
  }
})

router.post('/sendToken', async (req, res, next) => {
  try {
    let { tokenId, amount, to } = req.body
    const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
    let contractData = await getTokenData(tokenId);
    console.log(contractData.contractAddress, contractData)
    // let [rows, fields] = await pool.query("SELECT address from bnbAddresses WHERE `userId` = ?", [senderuserId])

    let instance = new web3.eth.Contract(abi, contractData.contractAddress);

    let wallet = web3.eth.accounts.wallet
    wallet.clear()
    wallet = wallet.create(0)
    wallet.add(config.wallet.eth.privKey)
    
    let gasLimit = await instance.methods.transfer(to, String(Number(amount) * 10 ** contractData.tokenDecimal)).estimateGas()

    gasLimit = Number(gasLimit) > 23000 ? gasLimit : "23000" //gasLimit should be minimum of 23000

    instance.methods.transfer(to, String(Number(amount) * 10 ** contractData.tokenDecimal))
      .send({
        from: wallet[0].address,
        gas: gasLimit
      }).on("transactionHash", async (hash) => {

        await pool.query('INSERT INTO bnbTransactions (txId, status, toAddress, amount, type, fromAddress) VALUES (?,?,?,?,?,?)', [hash, 'pending', to, amount, "Withdraw"])

        res.send({
          status: true,
          message: 'Transaction Initiated',
          hash: hash
        })
      }).on('error', err => {
        console.log(err)
        res.status(412).send({
          status: false,
          message: err.message
        })
      })

  } catch (error) {
    console.log(error)
    res.status(500).send({
      status: false,
      message: 'Error occurred'
    })
  }
})

router.use((err, req, res, next) => {
  res.status(400).send({
    status: false,
    message: err.message
  })
})

async function getTokenData(_tokenId) {
  let [rows, fields] = await pool.query("SELECT * from bnbToken WHERE `id` = ?", [_tokenId])
  return rows[0]
}

async function getAccountAtIndex(userId) {
  const web3 = new Web3()
  try {

    userId = Number(userId)
    console.log("test1")
    let isTestnet = config.wallet.eth.network == 'testnet' ? true : false
    let key = await _walletFactory.getExtendedKey(userId, isTestnet);
    let normalAddress = await _walletFactory.generateEthereumWallet(key);
    console.log(normalAddress)
    let address = web3.utils.toChecksumAddress(normalAddress.address)
    console.log("address", address)
    return address
  } catch (error) {
    console.log(error)
  }

}

async function sendTrx(receiver, amount, res) {
  const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
  let wallet = web3.eth.accounts.wallet
  wallet.clear()
  wallet = wallet.create(0)
  wallet.add(config.wallet.eth.privKey)
  console.log("wallet[0]", wallet[0])

  try {
    let gasPriceTx = await web3.eth.getGasPrice()
    console.log({ gasPrice: gasPriceTx })
    console.log(Number(gasPriceTx)*21000/10**18)
    let gasUsed = Number(gasPriceTx)*21000/10**18
    await web3.eth.sendTransaction({
      from: wallet[0],
      to: await web3.utils.toChecksumAddress(receiver),
      value: web3.utils.toWei(String(amount)),
      nonce: await web3.eth.getTransactionCount(wallet[0].address, "pending"),
      gasPrice: gasPriceTx, //'0x1DCD65000',
      gasLimit: "0x5208"//config.wallet.gasLimit

    }).on('transactionHash', async hash => {
      console.log("hash", hash)
      let txRec = await web3.eth.getTransaction(hash)
      console.log("txRec", txRec)
      await pool.query('INSERT INTO bnbTransactions (txid, status, toAddress, amount, type, fromAddress, gasFee) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        hash, 'pending', receiver, amount, 'withdraw', wallet[0].address, gasUsed
      ])
      res.send({
        status: true,
        message: 'Transaction Initiated',
        hash: hash
      })

    })
  } catch (err) {
    console.log(err.message)
    res.status(400).send({
      status: false,
      message: err.message
    })

  }
}

async function userSendTrx(userId, sender, receiver, amount, res) {
  console.log("sender, receiver, amount", sender, receiver, amount)
  const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
  let wallet = web3.eth.accounts.wallet
  wallet.clear()
  wallet = wallet.create(0)
  //wallet.add(config.wallet.eth.privKey)
  wallet.add(await getWallet(userId));
  console.log("wallet[0]", wallet[0])

  try {
    let gasPriceTx = await web3.eth.getGasPrice()
    console.log({ gasPrice: gasPriceTx })
    console.log(Number(gasPriceTx)*21000/10**18)
    let gasUsed = Number(gasPriceTx)*21000/10**18
    await web3.eth.sendTransaction({
      from: wallet[0],
      to: await web3.utils.toChecksumAddress(receiver),
      value: web3.utils.toWei(String(amount)),
      nonce: await web3.eth.getTransactionCount(wallet[0].address, "pending"),
      gasPrice: gasPriceTx, //'0x1DCD65000',
      gasLimit: "0x5208"//config.wallet.gasLimit

    }).on('transactionHash', async hash => {
      console.log("hash", hash)
      let txRec = await web3.eth.getTransaction(hash)
      console.log("txRec", txRec)
      await pool.query('INSERT INTO bnbTransactions (txid, status, toAddress, amount, type, fromAddress, gasFee) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        hash, 'pending', receiver, amount, 'withdraw', wallet[0].address, gasUsed
      ])
      res.send({
        status: "true",
        message: 'Transaction Initiated',
        hash: hash
      })

    })
  } catch (err) {
    console.log(err.message)
    res.status(400).send({
      status: false,
      message: err.message
    })

  }
}

async function getWallet(ref) {
  let extendedKey = _walletFactory.calculateBip44ExtendedKey(ref, true);
  let privKey = extendedKey.keyPair.d.toBuffer(32);
  return "0x" + privKey.toString("hex");
}

export default router;
