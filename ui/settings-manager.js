class SettingsManager {
    constructor(llm) {
        this.llm = llm;
        this.secureStorage = new SecureStorage();
        this.apiKeySaveTimeout = null;
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('chess-llm-settings') || '{}');
            
            // Provider settings
            if (settings.provider) {
                this.llm.setProvider(settings.provider);
                document.getElementById('llm-provider').value = settings.provider;
                this.handleProviderChange(settings.provider);
            }
            
            // LM Studio settings
            if (settings.lmstudio) {
                if (settings.lmstudio.model) {
                    this.llm.setModel(settings.lmstudio.model);
                    document.getElementById('llm-model').value = settings.lmstudio.model;
                }
                if (settings.lmstudio.endpoint) {
                    this.llm.setEndpoint(settings.lmstudio.endpoint);
                    document.getElementById('llm-endpoint').value = settings.lmstudio.endpoint;
                }
            }
            
            // OpenAI settings
            if (settings.openai) {
                const apiKey = this.secureStorage.getApiKey('openai');
                if (apiKey) {
                    this.llm.setOpenAIApiKey(apiKey);
                    document.getElementById('openai-api-key').value = apiKey;
                }
                
                if (settings.openai.model) {
                    this.llm.setOpenAIModel(settings.openai.model);
                    document.getElementById('openai-model').value = settings.openai.model;
                }
            }
            
            // Temperature
            if (settings.temperature !== undefined) {
                this.llm.setTemperature(settings.temperature);
                document.getElementById('llm-temperature').value = settings.temperature;
                document.getElementById('temperature-value').textContent = settings.temperature.toFixed(1);
            }
            
            this.updateApiKeyStatus();
            
        } catch (error) {
            console.warn('Could not load settings:', error);
            this.showApiKeyError('Failed to load saved settings');
        }
    }

    saveSettings() {
        try {
            if (this.llm.openaiApiKey) {
                this.secureStorage.setApiKey('openai', this.llm.openaiApiKey);
            }
            
            const settings = {
                provider: this.llm.provider,
                lmstudio: {
                    model: this.llm.model,
                    endpoint: this.llm.endpoint
                },
                openai: {
                    model: this.llm.openaiModel
                },
                temperature: this.llm.temperature
            };
            
            localStorage.setItem('chess-llm-settings', JSON.stringify(settings));
            this.updateApiKeyStatus();
            
        } catch (error) {
            console.warn('Could not save settings:', error);
            this.showApiKeyError('Failed to save settings');
        }
    }

    handleProviderChange(provider) {
        this.llm.setProvider(provider);
        
        const lmstudioSettings = document.getElementById('lmstudio-settings');
        const openaiSettings = document.getElementById('openai-settings');
        const aiPlayerLabel = document.getElementById('ai-player-label');
        
        if (provider === 'openai') {
            lmstudioSettings.style.display = 'none';
            openaiSettings.style.display = 'block';
            aiPlayerLabel.textContent = 'OpenAI (Black)';
        } else {
            lmstudioSettings.style.display = 'block';
            openaiSettings.style.display = 'none';
            aiPlayerLabel.textContent = 'LLM (Black)';
        }
        
        this.saveSettings();
    }

    updateApiKeyStatus() {
        const apiKeyInput = document.getElementById('openai-api-key');
        const hasApiKey = this.llm.openaiApiKey && this.llm.openaiApiKey.length > 0;
        
        const statusElement = this.getOrCreateApiKeyStatus();
        
        if (hasApiKey) {
            statusElement.className = 'api-key-status saved';
            statusElement.innerHTML = '<i class="fas fa-check-circle"></i> API Key Saved';
            apiKeyInput.style.borderColor = '#4CAF50';
        } else {
            statusElement.className = 'api-key-status missing';
            statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> API Key Required';
            apiKeyInput.style.borderColor = '#f44336';
        }
    }

    getOrCreateApiKeyStatus() {
        let statusElement = document.getElementById('api-key-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'api-key-status';
            statusElement.className = 'api-key-status';
            
            const apiKeyInput = document.getElementById('openai-api-key');
            apiKeyInput.parentNode.appendChild(statusElement);
        }
        return statusElement;
    }

    showApiKeyError(message) {
        const statusElement = this.getOrCreateApiKeyStatus();
        statusElement.className = 'api-key-status error';
        statusElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    }

    clearApiKey() {
        this.llm.setOpenAIApiKey('');
        document.getElementById('openai-api-key').value = '';
        this.secureStorage.removeApiKey('openai');
        this.saveSettings();
        this.updateApiKeyStatus();
    }

    addClearApiKeyButton() {
        const apiKeyGroup = document.getElementById('openai-api-key').parentNode;
        
        let clearButton = document.getElementById('clear-api-key-btn');
        if (!clearButton) {
            clearButton = document.createElement('button');
            clearButton.id = 'clear-api-key-btn';
            clearButton.type = 'button';
            clearButton.className = 'clear-api-key-btn';
            clearButton.innerHTML = '<i class="fas fa-times"></i> Clear API Key';
            clearButton.title = 'Clear saved API key';
            
            clearButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the saved API key?')) {
                    this.clearApiKey();
                }
            });
            
            apiKeyGroup.appendChild(clearButton);
        }
    }
}
