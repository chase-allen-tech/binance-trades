
import config from './config'
import mysqlPromise from 'mysql2/promise'
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
require('array-foreach-async')

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

const getAllUsers = async () => {
    let userAddresses = await pool.query("SELECT addressHex FROM bnbAddresses")
    let address = []
    for (let i = 0; i < userAddresses[0].length; i++) {
    address.push(web3.utils.toChecksumAddress(userAddresses[0][i].addressHex))
    }
    return address
}

let blockNumber = config.blockNumber
async function main() {
    try {
        let users = await getAllUsers()
        console.log("users", users)
        const web3eth = new Web3()
        try {
            let transactions = await web3.eth.getBlock(String(blockNumber),true)
            console.log('Checking Block', blockNumber)
            
            
            await transactions.transactions.forEachAsync(async _tx => {
                
                if (_tx.to) {
                    console.log("_tx",web3eth.utils.toChecksumAddress(_tx.to))
                    try {
                        if (users.indexOf(web3.utils.toChecksumAddress(_tx.to)) != -1) {
                            let receipt = await web3.eth.getTransactionReceipt(_tx.hash)
                            console.log('receipt', receipt)
                            _tx.value = _tx.value / (10 ** 18)
                            let test =await pool.query('INSERT INTO bnbTransactions (txid, status, toAddress, amount, result, type, fromAddress) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                                _tx.hash, 'completed', _tx.to, _tx.value, receipt.status, 'deposit',receipt.from
                            ])
                            console.log("dbresult",test)
                        }
                    } catch(error) { 
                        console.log("error",error)
                    }
                }

            })

            blockNumber = blockNumber + 1
            await sleep(2000)
            setImmediate(main)
        } catch (error) {
            console.log(error)
            await sleep(2000)
            setImmediate(main)
           
        }

    } catch (error) {
        console.log(error)
    }
}
const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}


main().then(console.log)