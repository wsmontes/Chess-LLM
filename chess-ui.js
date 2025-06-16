class ChessUI {
    constructor(chessEngine, llmClient) {
        this.engine = chessEngine;
        this.llm = llmClient;

        // Initialize modular UI components
        this.boardManager = new BoardManager(this.engine);
        this.settingsManager = new SettingsManager(this.llm);
        this.thinkingDisplay = new ThinkingDisplay();
        this.moveHandler = new MoveHandler(this.engine, this.llm, this.boardManager);
        this.gameController = new GameController(
            this.engine, 
            this.boardManager, 
            this.moveHandler, 
            this.thinkingDisplay
        );

        // Initialize components and bind events
        this.initializeComponents();
        this.bindEvents();
        
        // Set up LLM thinking callback
        this.llm.setThinkingCallback((steps) => this.thinkingDisplay.updateThinkingDisplay(steps));

        // Load saved settings
        this.settingsManager.loadSettings();
        
        // Initial display update
        this.gameController.updateDisplay();
    }

    initializeComponents() {
        // Initialize board
        this.boardManager.initializeBoard();
    }

    bindEvents() {
        // Connect the modules through event binding
        
        // Board interaction events
        this.boardManager.boardElement.addEventListener('click', (e) => {
            if (this.moveHandler.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square) {
                this.gameController.handleSquareClick(square.dataset.square);
            }
        });

        // Game control buttons
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.gameController.startNewGame();
        });

        document.getElementById('undo-btn').addEventListener('click', () => {
            // Implement undo through game controller
            this.gameController.undoMove();
        });

        document.getElementById('hint-btn').addEventListener('click', () => {
            this.getHint();
        });

        // Modal game control buttons
        document.getElementById('new-game-modal-btn').addEventListener('click', () => {
            this.closeModal();
            this.gameController.startNewGame();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // Settings events
        document.getElementById('llm-provider').addEventListener('change', (e) => {
            this.settingsManager.handleProviderChange(e.target.value);
            this.testConnection();
        });

        // Temperature slider
        document.getElementById('llm-temperature').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('temperature-value').textContent = value.toFixed(1);
            this.llm.setTemperature(value);
            this.settingsManager.saveSettings();
        });

        // LM Studio settings
        document.getElementById('llm-model').addEventListener('change', (e) => {
            this.llm.setModel(e.target.value);
            this.settingsManager.saveSettings();
        });

        document.getElementById('llm-endpoint').addEventListener('change', (e) => {
            this.llm.setEndpoint(e.target.value);
            this.settingsManager.saveSettings();
            this.testConnection();
        });

        // OpenAI settings
        document.getElementById('openai-api-key').addEventListener('input', (e) => {
            const apiKey = e.target.value.trim();
            this.llm.setOpenAIApiKey(apiKey);
            
            clearTimeout(this.settingsManager.apiKeySaveTimeout);
            this.settingsManager.apiKeySaveTimeout = setTimeout(() => {
                this.settingsManager.saveSettings();
                if (apiKey) {
                    this.testConnection();
                }
            }, 1000);
        });

        document.getElementById('openai-api-key').addEventListener('paste', (e) => {
            setTimeout(() => {
                const apiKey = e.target.value.trim();
                if (apiKey.startsWith('sk-')) {
                    this.llm.setOpenAIApiKey(apiKey);
                    this.settingsManager.saveSettings();
                    this.testConnection();
                }
            }, 100);
        });

        this.settingsManager.addClearApiKeyButton();

        // Thinking toggle
        document.getElementById('thinking-toggle').addEventListener('change', (e) => {
            this.thinkingDisplay.isThinkingVisible = e.target.checked;
            document.getElementById('thinking-content').classList.toggle('hidden', !this.thinkingDisplay.isThinkingVisible);
        });

        // Test connection on startup
        this.testConnection();
    }

    closeModal() {
        const modal = document.getElementById('game-over-modal');
        modal.classList.remove('active');
    }

    async getHint() {
        if (this.engine.currentPlayer !== 'white' || this.moveHandler.isWaitingForLLM) return;

        try {
            this.thinkingDisplay.showThinking(true);
            const hint = await this.llm.getHint(this.engine, this.engine.moveHistory, 'white');
            this.thinkingDisplay.showThinking(false);
            
            alert(`Hint: ${hint}`);
        } catch (error) {
            this.thinkingDisplay.showThinking(false);
            this.gameController.showError('Could not get hint: ' + error.message);
        }
    }

    async testConnection() {
        const result = await this.llm.testConnection();
        this.updateConnectionStatus(result);
    }

    updateConnectionStatus(result) {
        const statusElement = document.getElementById('connection-status');
        const icon = statusElement.querySelector('i');
        const text = statusElement.querySelector('span');

        statusElement.className = 'connection-status';
        
        if (result.success) {
            statusElement.classList.add('connected');
            icon.className = 'fas fa-circle';
            const providerName = this.llm.provider === 'openai' ? 'OpenAI' : 'LM Studio';
            text.textContent = `Connected to ${providerName}`;
        } else {
            statusElement.classList.add('error');
            icon.className = 'fas fa-circle';
            text.textContent = 'Connection failed';
        }
    }

    // Add error recovery method
    recoverFromStuckState() {
        try {
            console.log("Attempting to recover from stuck state...");
            
            // Reset waiting states
            if (this.moveHandler) {
                this.moveHandler.isWaitingForLLM = false;
            }
            
            // Hide thinking indicators
            if (this.thinkingDisplay) {
                this.thinkingDisplay.showThinking(false);
                this.thinkingDisplay.showThinkingStreamIndicator(false);
            }
            
            // Clear board selection
            if (this.boardManager) {
                this.boardManager.clearSelection();
            }
            
            // Check the current state to determine best recovery approach
            const isBlacksTurn = this.engine.currentPlayer === 'black';
            
            if (isBlacksTurn) {
                console.log("Black's turn - attempting to make a random move");
                
                // Try to make a random move for Black
                return this.forceRandomMove();
            } else {
                // White's turn - just update the UI
                console.log("White's turn - refreshing UI state");
                this.gameController.updateDisplay();
                this.gameController.updateStatus();
            }
            
            console.log("Game state recovery completed");
            return true;
        } catch (error) {
            console.error("Failed to recover game state:", error);
            
            // Last resort - start a new game
            try {
                console.log("Attempting new game as last resort");
                this.gameController.startNewGame();
                return true;
            } catch (criticalError) {
                console.error("Critical error during recovery:", criticalError);
                return false;
            }
        }
    }

    // New method for forcing a random move
    async forceRandomMove() {
        if (this.engine.currentPlayer !== 'black') {
            console.log("Cannot force random move - not Black's turn");
            return false;
        }
        
        try {
            console.log("Executing random move for Black");
            this.moveHandler.isWaitingForLLM = false;
            
            const move = await this.moveHandler.makeRandomMove();
            if (move) {
                this.gameController.updateDisplay();
                this.gameController.addMoveToHistory(move);
                console.log("Random move executed:", move.notation);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error("Force random move failed:", error);
            return false;
        }
    }
    
    // Modify the existing forceLLMMove method to be more robust
    async forceLLMMove() {
        if (this.engine.currentPlayer !== 'black') {
            console.log("Can't force LLM move - it's not Black's turn");
            return false;
        }
        
        try {
            console.log("Manually triggering LLM move");
            this.moveHandler.isWaitingForLLM = false;
            
            // Set a hard timeout for manual forcing
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Manual LLM move timed out')), 15000);
            });
            
            // Race between normal LLM move and timeout
            await Promise.race([
                this.gameController.getLLMMove(),
                timeoutPromise
            ]);
            
            return true;
        } catch (error) {
            console.error("Force LLM move failed:", error);
            console.log("Attempting random move fallback");
            return await this.forceRandomMove();
        }
    }
}

