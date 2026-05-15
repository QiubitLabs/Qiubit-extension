const { ethers } = require('ethers');

async function testWOctBalance() {
    // Alamat kontrak wOCT
    const wOCT_ADDRESS = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';
    // Alamat wallet untuk di-cek
    const walletAddress = '0xeF52Bc9eF26119014e7Ed7094cD786da522141E9';
    
    // ABI ERC-20 sederhana untuk balanceOf
    const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
    
    // RPC Alchemy (menggunakan URL dari .env kamu)
    const rpcUrl = 'https://eth-mainnet.g.alchemy.com/v2/_JJxS_y41ePFKtEgApvblp6sBbm_njoi';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {
        console.log("Menghubungkan ke provider...");
        const contract = new ethers.Contract(ethers.getAddress(wOCT_ADDRESS), erc20Abi, provider);
        
        console.log(`Mengambil saldo untuk: ${walletAddress}...`);
        const balance = await contract.balanceOf(ethers.getAddress(walletAddress));
        
        console.log("Saldo wOCT (Raw):", balance.toString());
        console.log("Saldo wOCT (Formatted):", ethers.formatEther(balance));
    } catch (e) {
        console.error("Gagal mendapatkan saldo:", e);
    }
}

testWOctBalance();