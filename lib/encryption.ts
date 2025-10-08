// Encryption utilities for user data protection
export class EncryptionService {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12; // 96 bits for GCM

  // Use browser crypto API
  private static get crypto(): Crypto {
    return globalThis.crypto;
  }

  /**
   * Derive a cryptographic key from the user's password
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await this.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return this.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 200000, // Increased from 100,000 for maximum security
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate a random salt for key derivation
   */
  private static generateSalt(): Uint8Array {
    return this.crypto.getRandomValues(new Uint8Array(16)); // 128-bit salt
  }

  /**
   * Generate a random IV for encryption
   */
  private static generateIV(): Uint8Array {
    return this.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
  }

  /**
   * Encrypt data using AES-GCM with user's password
   */
  static async encrypt(data: string, password: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const salt = this.generateSalt();
      const iv = this.generateIV();
      const key = await this.deriveKey(password, salt);

      const encrypted = await this.crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv as BufferSource,
        },
        key,
        dataBuffer
      );

      // Combine salt + iv + encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Convert to base64 in chunks to avoid stack overflow
      let binaryString = '';
      const chunkSize = 8192; // Process in 8KB chunks
      for (let i = 0; i < combined.length; i += chunkSize) {
        const chunk = combined.slice(i, i + chunkSize);
        binaryString += String.fromCharCode(...Array.from(chunk));
      }
      return btoa(binaryString);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-GCM with user's password
   */
  static async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      // Convert from base64 in chunks to avoid stack overflow
      const binaryString = atob(encryptedData);
      const combined = new Uint8Array(binaryString.length);
      const chunkSize = 8192; // Process in 8KB chunks
      for (let i = 0; i < binaryString.length; i += chunkSize) {
        const chunk = binaryString.slice(i, i + chunkSize);
        for (let j = 0; j < chunk.length; j++) {
          combined[i + j] = chunk.charCodeAt(j);
        }
      }

      // Extract salt, iv, and encrypted data
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 16 + this.IV_LENGTH);
      const encrypted = combined.slice(16 + this.IV_LENGTH);

      const key = await this.deriveKey(password, salt);

      const decrypted = await this.crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv as BufferSource,
        },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Hash a password for additional security (used for password verification)
   */
  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await this.crypto.subtle.digest('SHA-256', data);

    // Convert hash to base64
    const hashArray = new Uint8Array(hash);
    const binaryString = String.fromCharCode(...hashArray);
    return btoa(binaryString);
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }

  /**
   * Generate a secure random string for additional entropy
   */
  static generateSecureToken(length: number = 32): string {
    const array = new Uint8Array(length);
    this.crypto.getRandomValues(array);
    
    // Convert to base64 in chunks to avoid stack overflow
    let binaryString = '';
    const chunkSize = 8192; // Process in 8KB chunks
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...Array.from(chunk));
    }
    return btoa(binaryString).replace(/[+/=]/g, '').substring(0, length);
  }
}