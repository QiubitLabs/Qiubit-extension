export const OCT_DECIMALS = 6;

export function sleep(ms: number): Promise<void> {
    return new Promise<void>(r => setTimeout(r, ms));
}

export function parseUnitsOct(human: string): string {
    const sanitized = human.replace(/,/g, '.');
    const parts = sanitized.split('.');
    const intPart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(OCT_DECIMALS, '0').substring(0, OCT_DECIMALS);
    const raw = BigInt(intPart) * BigInt(10 ** OCT_DECIMALS) + BigInt(fracPart);
    return raw.toString();
}

export async function abiEncodeStringUint(str: string, uint: string): Promise<string> {
    const offset = '0000000000000000000000000000000000000000000000000000000000000040';
    const uintHex = BigInt(uint).toString(16).padStart(64, '0');
    const strLen = str.length.toString(16).padStart(64, '0');
    let strHex = '';
    for (let i = 0; i < str.length; i++) {
        strHex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    while (strHex.length % 64 !== 0) strHex += '0';
    return offset + uintHex + strLen + strHex;
}
