const bip39 = require("bip39");
const bitcoinjs = require("bitcoinjs-lib");
const ethUtil = require('ethereumjs-util');
const PrivateKey = require("bitcore-lib").PrivateKey;
const Address = require("bitcore-lib").Address;
const PublicKey = require("bitcore-lib").PublicKey;

const config = require('../config')
class WalletFactory {
    constructor(mnemonics, passphrase, network) {
        this._mnemonics = config.wallet.mnemonics;
        this._passphrase = config.wallet.password;
        this._derivedPath = "m/44'/60";
        this._network = config.wallet.network;
    }

    calcBip32RootKeyFromSeed(phrase, passphrase) {
        let seed = bip39.mnemonicToSeed(phrase, passphrase);
        let bip32RootKey = bitcoinjs.HDNode.fromSeedHex(seed);
        return bip32RootKey;
    }

    calcBip32ExtendedKey(bip32RootKey, path) {
        if (!bip32RootKey) {
            return bip32RootKey;
        }

        let extendedKey = bip32RootKey;
        let pathBits = path.split("/");
        for (var i = 0; i < pathBits.length; i++) {
            let bit = pathBits[i];
            let index = parseInt(bit);

            if (isNaN(index)) {
                continue;
            }

            let hardened = bit[bit.length - 1] == "'";
            let isPriv = !(extendedKey.isNeutered());
            let invalidDerivationPath = hardened && !isPriv;

            if (invalidDerivationPath) {
                extendedKey = null;
            } else if (hardened) {
                extendedKey = extendedKey.deriveHardened(index);
            } else {
                extendedKey = extendedKey.derive(index);
            }
        }

        return extendedKey;
    }

    getExtendedKey(account, internal) {
        let isInternalWallet = true;
        if (!internal || internal === "false") {
            isInternalWallet = false;
        }

        return this.calculateBip44ExtendedKey(account, isInternalWallet);
    }

    generateEthereumWallet(extendedKey) {
        let privKey = extendedKey.keyPair.d.toBuffer(32);
        return this.restoreEthereumAddressFromPrivKey(privKey);
    }

    generateBitcoinWallet(extendedKey) {
        let wif = extendedKey.keyPair.toWIF();
        return this.restoreBitcoinAddressFromWif(wif);
    }

    restoreBitcoinAddressFromWif(wif) {
        let privateKey = PrivateKey.fromWIF(wif);
        let publicKey = new PublicKey(privateKey);
        let address = new Address(publicKey, this._network);

        return {
            privKey: privateKey.toString(),
            address: address.toString()
        }
    }

    restoreEthereumAddressFromPrivKey(privKey) {
        let pubKey = ethUtil.privateToPublic(privKey);
        let address = ethUtil.publicToAddress(pubKey);

        return {
            privKey: privKey.toString("hex"),
            address: "0x" + address.toString("hex"),
        }
    }

    calculateBip44ExtendedKey(account, internal) {
        if (!bip39.validateMnemonic(this._mnemonics)) {
            throw new Error("invalid_seed");
        }

        let bip32RootKey = this.calcBip32RootKeyFromSeed(this._mnemonics, this._passphrase);
        let internalIndex = internal ? "/1" : "/0";
        let derivedPath = this._derivedPath + //"purpose" - bip44
            "'/0'/" + //server identity
            account.toString() + //account identity
            internalIndex; //server internal/external index

        let bip32ExtendedKey = this.calcBip32ExtendedKey(bip32RootKey, derivedPath);
        return bip32ExtendedKey;
    }
}

module.exports = {
    WalletFactory
}