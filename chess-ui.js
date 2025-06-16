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

        // Mobile navigation state
        this.currentMobileTab = 'board';
        this.isMobile = window.innerWidth < 768;

        // Initialize components and bind events
        this.initializeComponents();
        this.bindEvents();
        this.setupMobileNavigation();
        this.setupResponsiveLayout();
        
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
        
        // Set initial mobile view
        if (this.isMobile) {
            this.showMobileSection('board');
        }
    }

    setupMobileNavigation() {
        const navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = tab.dataset.tab;
                this.switchMobileTab(tabName);
            });
        });
    }

    setupResponsiveLayout() {
        // Listen for window resize to adjust layout
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth < 768;
            
            if (wasMobile !== this.isMobile) {
                if (this.isMobile) {
                    this.showMobileSection(this.currentMobileTab);
                } else {
                    this.showAllSections();
                }
            }
        });
        
        // Initial setup
        if (this.isMobile) {
            this.showMobileSection('board');
        } else {
            this.showAllSections();
        }
    }

    switchMobileTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        this.currentMobileTab = tabName;
        this.showMobileSection(tabName);
    }

    showMobileSection(sectionName) {
        if (!this.isMobile) return;
        
        const sections = {
            'board': 'board-section',
            'thinking': 'thinking-section',
            'history': 'history-section',
            'controls': 'controls-section',
            'settings': 'settings-section'
        };
        
        // Hide all sections
        Object.values(sections).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
        
        // Show selected section
        const targetSection = document.getElementById(sections[sectionName]);
        if (targetSection) {
            targetSection.style.display = 'block';
        }
        
        // Special handling for board section
        if (sectionName === 'board') {
            const boardContainer = document.querySelector('.game-board-container');
            if (boardContainer) {
                boardContainer.style.display = 'block';
            }
        }
    }

    showAllSections() {
        const sections = [
            'board-section',
            'thinking-section', 
            'history-section',
            'controls-section',
            'settings-section'
        ];
        
        sections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'block';
            }
        });
        
        const boardContainer = document.querySelector('.game-board-container');
        if (boardContainer) {
            boardContainer.style.display = 'block';
        }
    }

    bindEvents() {
        // Connect the modules through event binding
        
        // Board interaction events with improved touch handling
        this.boardManager.boardElement.addEventListener('click', (e) => {
            if (this.moveHandler.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square) {
                e.preventDefault();
                this.gameController.handleSquareClick(square.dataset.square);
            }
        });

        // Touch events for better mobile interaction
        let touchStartTime = 0;
        this.boardManager.boardElement.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
        });

        this.boardManager.boardElement.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 500) { // Treat as tap if less than 500ms
                const square = e.target.closest('.square');
                if (square && !this.moveHandler.isWaitingForLLM) {
                    e.preventDefault();
                    this.gameController.handleSquareClick(square.dataset.square);
                }
            }
        });

        // Game control buttons
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.gameController.startNewGame();
            if (this.isMobile) {
                this.switchMobileTab('board');
            }
        });

        document.getElementById('undo-btn').addEventListener('click', () => {
            this.gameController.undoMove();
        });

        document.getElementById('hint-btn').addEventListener('click', () => {
            this.getHint();
        });

        // Modal game control buttons
        document.getElementById('new-game-modal-btn').addEventListener('click', () => {
            this.closeModal();
            this.gameController.startNewGame();
            if (this.isMobile) {
                this.switchMobileTab('board');
            }
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // Settings events with improved mobile UX
        document.getElementById('llm-provider').addEventListener('change', (e) => {
            this.settingsManager.handleProviderChange(e.target.value);
            this.testConnection();
            
            // Update AI player label
            const aiLabel = document.getElementById('ai-player-label');
            if (e.target.value === 'openai') {
                aiLabel.textContent = 'OpenAI (Black)';
            } else {
                aiLabel.textContent = 'AI (Black)';
            }
        });

        // Temperature slider with live feedback
        const temperatureSlider = document.getElementById('llm-temperature');
        const temperatureValue = document.getElementById('temperature-value');
        
        temperatureSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            temperatureValue.textContent = value.toFixed(1);
            this.llm.setTemperature(value);
        });
        
        temperatureSlider.addEventListener('change', () => {
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

        // OpenAI settings with improved feedback
        const apiKeyInput = document.getElementById('openai-api-key');
        
        apiKeyInput.addEventListener('input', (e) => {
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

        apiKeyInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                const apiKey = e.target.value.trim();
                if (apiKey.startsWith('sk-')) {
                    this.llm.setOpenAIApiKey(apiKey);
                    this.settingsManager.saveSettings();
                    this.testConnection();
                }
            }, 100);
        });

        // OpenAI model selection
        document.getElementById('openai-model').addEventListener('change', (e) => {
            this.llm.setOpenAIModel(e.target.value);
            this.settingsManager.saveSettings();
        });

        this.settingsManager.addClearApiKeyButton();

        // Thinking toggle
        document.getElementById('thinking-toggle').addEventListener('change', (e) => {
            this.thinkingDisplay.isThinkingVisible = e.target.checked;
            const thinkingContent = document.getElementById('thinking-content');
            thinkingContent.classList.toggle('hidden', !this.thinkingDisplay.isThinkingVisible);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            
            switch(e.key) {
                case 'n':
                case 'N':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.gameController.startNewGame();
                    }
                    break;
                case 'u':
                case 'U':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.gameController.undoMove();
                    }
                    break;
                case 'h':
                case 'H':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.getHint();
                    }
                    break;
                case 'Escape':
                    this.closeModal();
                    this.boardManager.clearSelection();
                    break;
            }
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
            // Show loading state
            const hintBtn = document.getElementById('hint-btn');
            const originalText = hintBtn.innerHTML;
            hintBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Getting hint...</span>';
            hintBtn.disabled = true;

            this.thinkingDisplay.showThinking(true);
            const hint = await this.llm.getHint(this.engine, this.engine.moveHistory, 'white');
            this.thinkingDisplay.showThinking(false);
            
            // Show hint in a more mobile-friendly way
            if (this.isMobile) {
                // For mobile, switch to thinking tab and show hint there
                this.thinkingDisplay.addCustomThinking('Hint', hint);
                this.switchMobileTab('thinking');
            } else {
                // For desktop, show in alert
                alert(`Hint: ${hint}`);
            }
        } catch (error) {
            this.thinkingDisplay.showThinking(false);
            this.gameController.showError('Could not get hint: ' + error.message);
        } finally {
            // Restore button
            const hintBtn = document.getElementById('hint-btn');
            hintBtn.innerHTML = '<i class="fas fa-lightbulb"></i> <span>Get Hint</span>';
            hintBtn.disabled = false;
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
            icon.className = 'fas fa-check-circle';
            const providerName = this.llm.provider === 'openai' ? 'OpenAI' : 'LM Studio';
            text.textContent = `Connected to ${providerName}`;
        } else {
            statusElement.classList.add('error');
            icon.className = 'fas fa-exclamation-circle';
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

