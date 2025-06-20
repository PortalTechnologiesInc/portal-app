export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Remove potential data URI prefix if present
    const base64Data = base64.split(',')[1] || base64;
    
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }