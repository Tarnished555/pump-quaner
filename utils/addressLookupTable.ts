import { Transaction, sendAndConfirmTransaction, AddressLookupTableProgram, Connection, Keypair, PublicKey, TransactionConfirmationStatus } from "@solana/web3.js";
import fs from 'fs';

// 保存地址到文件
function saveAddressToFile(address: string): void {
    const filePath = './config/lookupTable.txt';
    
    // Ensure directory exists
    const dirPath = './config';
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        } catch (err) {
            console.error(`Failed to create directory ${dirPath}:`, err);
            return;
        }
    }
    
    fs.appendFile(filePath, address + '\n', (err) => {
        if (err) {
            console.error("保存地址到文件失败:", err);
        } else {
            console.log(`地址已保存到文件: ${address}`);
        }
    });
}

// 查询当前slot
async function getCurrentSlot(connection: Connection): Promise<number> {
    const slot = await connection.getSlot();
    console.log("当前 Slot:", slot);
    return slot;
}

interface LookupTableResult {
    lookupTableAddress: PublicKey;
    signature: string;
}

// 创建地址查找表
async function createAddressLookupTable(connection: Connection, payer: Keypair): Promise<LookupTableResult | null> {
    try {
        const slot = await getCurrentSlot(connection);
        const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
            authority: payer.publicKey,
            payer: payer.publicKey,
            recentSlot: slot,
        });

        console.log("查找表地址:", lookupTableAddress.toBase58()); 
        const transaction = new Transaction().add(lookupTableInst); 
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log("交易签名并发送:", signature);
       
        await connection.confirmTransaction(signature);

        console.log("交易已确认");

        saveAddressToFile(lookupTableAddress.toBase58());
        return { lookupTableAddress, signature };
    } catch (error) {
        console.error("创建地址查找表失败:", error);
        return null;
    }
}

// 扩展地址查找表
async function extendAddressLookupTable(
    connection: Connection, 
    payer: Keypair, 
    lookupTableAddress: PublicKey, 
    publicKeys: PublicKey[]
): Promise<string | null> { 
    const extendLookupTableInst = AddressLookupTableProgram.extendLookupTable({
        authority: payer.publicKey, 
        payer: payer.publicKey, 
        lookupTable: lookupTableAddress, 
        addresses: publicKeys, 
    }); 
    const transaction = new Transaction().add(extendLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

    console.log("扩展地址查找表成功，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed' as TransactionConfirmationStatus);

    if (confirmation.value.err) {
        console.error("扩展地址查找表失败，错误:", confirmation.value.err);
        return null;
    }
    console.log("扩展地址查找表成功");
    return signature;
}

// 关闭地址查找表
async function closeAddressLookupTable(
    connection: Connection, 
    payer: Keypair, 
    lookupTableAddress: PublicKey
): Promise<string | null> { 
    const closeLookupTableInst = AddressLookupTableProgram.closeLookupTable({
        authority: payer.publicKey, 
        lookupTable: lookupTableAddress, 
        recipient: payer.publicKey, 
    }); 
    const transaction = new Transaction().add(closeLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

    console.log("交易已签名并发送，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed' as TransactionConfirmationStatus);

    if (confirmation.value.err) {
        console.error("交易确认失败:", confirmation.value.err);
        return null;
    }
    console.log("交易已确认");
    return signature;
}

// 激活地址查找表
async function deactivateAddressLookupTable(
    connection: Connection, 
    payer: Keypair, 
    lookupTableAddress: PublicKey
): Promise<string | null> {
    
    const deactivateLookupTableInst = AddressLookupTableProgram.deactivateLookupTable({
        authority: payer.publicKey, 
        lookupTable: lookupTableAddress, 
    }); 
    const transaction = new Transaction().add(deactivateLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

    console.log("交易已签名并发送，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed' as TransactionConfirmationStatus);

    if (confirmation.value.err) {
        console.error("交易确认失败:", confirmation.value.err);
        return null;
    }
    console.log("交易已确认");
    return signature;
}

export {
    getCurrentSlot,
    createAddressLookupTable,
    extendAddressLookupTable,
    closeAddressLookupTable,
    deactivateAddressLookupTable,
};
