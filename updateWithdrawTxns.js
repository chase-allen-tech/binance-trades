//const cron = require('node-cron')
import {default as cron} from 'node-cron'
import mysqlPromise from 'mysql2/promise'

//const mysql = require('mysql2/promise');
// import Tronweb from 'tronweb'
import config from './config'
import Web3 from 'web3'
const web3 = new Web3(new Web3.providers.HttpProvider(config.wallet.provider))
//const Tronweb = require('tronweb')
//const { default: config } = require('./config')


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
  Ezv2nnkLMTnaL1hV
let isRunning = false

cron.schedule("* * * * *", async () => {
    console.log(await web3.eth.getTransactionReceipt("0xe77654dd270d8ee23c9a555157782b9158be13323ebe8fd4c9afd7a9e87118ee"))
    if (!isRunning) {
        isRunning = true
        try {
            let [rows, fields] = await pool.query("SELECT txid FROM bnbTransactions WHERE `status` = ?", ["pending"])
            //console.log('new',rows)
            for(let i=0; i< rows.length; i++) {
                console.log(rows[i].txid)
                try{
                    let tx = await web3.eth.getTransactionReceipt(rows[i].txid)
                    console.log("tx",tx)
                    if(tx){
                        console.log("tx.status",tx.status)
                    //if((tx.status == 1) || (tx.status == true)||(tx.status == "true")){
                        await pool.query('UPDATE bnbTransactions SET status = "completed" , result = ? WHERE txid = ?', [tx.status, rows[i].txid])
}
                    //}
                }catch{}
               
            }

/*             await rows[0].forEachAsync(async _txn => {
                let receipt = await tronWeb.trx.getConfirmedTransaction(_txn)

                if (receipt && receipt.ret) {
                    await pool.query("UPDATE bnbTransactions SET status = ? WHERE txid = ?", [receipt.ret[0].contractRet, _txn])
                }
            }) */

            isRunning = false
        } catch (error) {
            console.log(error)
            isRunning = false
        }
    }


})