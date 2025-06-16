class SecureStorage {
    constructor() {
        this.storageKey = 'chess-llm-secure';
        this.encryptionKey = this.getOrCreateEncryptionKey();
    }

    getOrCreateEncryptionKey() {
        let key = localStorage.getItem('chess-llm-key');
        if (!key) {
            key = this.generateBrowserKey();
            localStorage.setItem('chess-llm-key', key);
        }
        return key;
    }

    generateBrowserKey() {
        const fingerprint = [
            navigator.userAgent.substring(0, 50),
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset().toString()
        ].join('|');
        
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
    }

    simpleEncrypt(text, key) {
        if (!text) return '';
        
        try {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                const keyChar = key.charCodeAt(i % key.length);
                result += String.fromCharCode(char ^ keyChar);
            }
            
            return this.base64UrlEncode(result);
        } catch (error) {
            console.error('Encryption error:', error);
            return '';
        }
    }

    simpleDecrypt(encryptedText, key) {
        if (!encryptedText) return '';
        
        try {
            const decoded = this.base64UrlDecode(encryptedText);
            let result = '';
            
            for (let i = 0; i < decoded.length; i++) {
                const char = decoded.charCodeAt(i);
                const keyChar = key.charCodeAt(i % key.length);
                result += String.fromCharCode(char ^ keyChar);
            }
            
            return result;
        } catch (error) {
            console.warn('Failed to decrypt API key:', error);
            return '';
        }
    }

    base64UrlEncode(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i) & 0xFF;
        }
        
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    base64UrlDecode(str) {
        str += '='.repeat((4 - str.length % 4) % 4);
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(str);
        return binary;
    }

    setApiKey(provider, apiKey) {
        try {
            const encrypted = this.simpleEncrypt(apiKey, this.encryptionKey);
            const storage = this.getSecureStorage();
            storage[provider] = {
                key: encrypted,
                timestamp: Date.now()
            };
            localStorage.setItem(this.storageKey, JSON.stringify(storage));
        } catch (error) {
            console.error('Failed to save API key:', error);
            throw new Error('Failed to save API key securely');
        }
    }

    getApiKey(provider) {
        try {
            const storage = this.getSecureStorage();
            const data = storage[provider];
            
            if (!data) return '';
            
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            if (Date.now() - data.timestamp > thirtyDays) {
                this.removeApiKey(provider);
                return '';
            }
            
            return this.simpleDecrypt(data.key, this.encryptionKey);
        } catch (error) {
            console.warn('Failed to load API key:', error);
            return '';
        }
    }

    removeApiKey(provider) {
        try {
            const storage = this.getSecureStorage();
            delete storage[provider];
            localStorage.setItem(this.storageKey, JSON.stringify(storage));
        } catch (error) {
            console.error('Failed to remove API key:', error);
        }
    }

    getSecureStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch (error) {
            return {};
        }
    }

    cleanup() {
        try {
            const storage = this.getSecureStorage();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            let cleaned = false;
            
            for (const [provider, data] of Object.entries(storage)) {
                if (data && data.timestamp && Date.now() - data.timestamp > thirtyDays) {
                    delete storage[provider];
                    cleaned = true;
                }
            }
            
            if (cleaned) {
                localStorage.setItem(this.storageKey, JSON.stringify(storage));
            }
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }
}
