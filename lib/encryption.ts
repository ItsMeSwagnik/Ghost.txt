import nacl from "tweetnacl"
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util"

// Generate a new encryption key
export function generateEncryptionKey(): string {
  const key = nacl.randomBytes(nacl.secretbox.keyLength)
  return encodeBase64(key)
}

// Encrypt a message using the shared key
export function encryptMessage(message: string, keyBase64: string): string {
  console.log("[Encryption] Encrypting message")
  const key = decodeBase64(keyBase64)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = decodeUTF8(message)
  const encrypted = nacl.secretbox(messageBytes, nonce, key)
  
  // Combine nonce and encrypted message
  const combined = new Uint8Array(nonce.length + encrypted.length)
  combined.set(nonce)
  combined.set(encrypted, nonce.length)
  
  return encodeBase64(combined)
}

// Decrypt a message using the shared key
export function decryptMessage(encryptedBase64: string, keyBase64: string): string | null {
  try {
    console.log("[Encryption] Decrypting message")
    const key = decodeBase64(keyBase64)
    const combined = decodeBase64(encryptedBase64)
    
    const nonce = combined.slice(0, nacl.secretbox.nonceLength)
    const encrypted = combined.slice(nacl.secretbox.nonceLength)
    
    const decrypted = nacl.secretbox.open(encrypted, nonce, key)
    
    if (!decrypted) {
      console.warn("[Encryption] Decryption failed — wrong key or corrupted data")
      return null
    }
    
    return encodeUTF8(decrypted)
  } catch (err) {
    console.error("[Encryption] Decryption threw an error:", err)
    return null
  }
}

// Generate a random 4-digit room ID
export function generateRoomId(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

// Validate room ID format
export function isValidRoomId(roomId: string): boolean {
  return /^\d{4}$/.test(roomId)
}
