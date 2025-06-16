// Main application initialization
class ChessApp {
    constructor() {
        this.engine = null;
        this.llmClient = null;
        this.ui = null;
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeApp());
        } else {
            this.initializeApp();
        }
    }

    initializeApp() {
        try {
            // Clean up old stored API keys on startup
            this.cleanupSecureStorage();

            // Initialize chess engine
            this.engine = new ChessEngine();
            console.log('Chess engine initialized');

            // Initialize LLM client
            this.llmClient = new LLMClient();
            console.log('LLM client initialized');

            // Initialize UI
            this.ui = new ChessUI(this.engine, this.llmClient);
            console.log('Chess UI initialized');

            // Add global error handler
            window.addEventListener('error', (event) => {
                console.error('Global error:', event.error);
                this.handleGlobalError(event.error);
            });

            // Add unhandled promise rejection handler
            window.addEventListener('unhandledrejection', (event) => {
                console.error('Unhandled promise rejection:', event.reason);
                this.handleGlobalError(event.reason);
            });

            console.log('Chess vs LLM application initialized successfully');

        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showInitializationError(error);
        }
    }

    cleanupSecureStorage() {
        try {
            // Clean up API keys older than 30 days
            const secureStorage = new SecureStorage();
            secureStorage.cleanup();
        } catch (error) {
            console.warn('Failed to cleanup secure storage:', error);
        }
    }

    handleGlobalError(error) {
        // Don't show error modal for every error, just log it
        console.error('Application error:', error);
        
        // You could implement a more sophisticated error handling system here
        // For example, sending errors to a logging service
    }

    showInitializationError(error) {
        // Show a simple error message if the app fails to initialize
        document.body.innerHTML = `
            <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                font-family: 'Inter', sans-serif;
                background-color: #f5f5f5;
            ">
                <div style="
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    text-align: center;
                    max-width: 400px;
                ">
                    <h2 style="color: #f44336; margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                        Application Error
                    </h2>
                    <p style="color: #666; margin-bottom: 1rem;">
                        Failed to initialize the chess application.
                    </p>
                    <p style="color: #999; font-size: 0.9rem;">
                        ${error.message}
                    </p>
                    <button 
                        onclick="window.location.reload()" 
                        style="
                            background: #4CAF50;
                            color: white;
                            border: none;
                            padding: 0.5rem 1rem;
                            border-radius: 4px;
                            cursor: pointer;
                            margin-top: 1rem;
                        "
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        `;
    }

    // Utility methods that might be useful
    getAppStatus() {
        return {
            engine: this.engine ? 'initialized' : 'not initialized',
            llmClient: this.llmClient ? 'initialized' : 'not initialized',
            ui: this.ui ? 'initialized' : 'not initialized',
            llmConnection: this.llmClient ? this.llmClient.getStatus() : null
        };
    }

    async testLLMConnection() {
        if (!this.llmClient) {
            throw new Error('LLM client not initialized');
        }
        return await this.llmClient.testConnection();
    }

    resetGame() {
        if (this.ui) {
            this.ui.startNewGame();
        }
    }

    exportGame() {
        if (!this.engine) return null;
        
        return {
            moveHistory: this.engine.moveHistory,
            currentPosition: this.engine.getBoardAsFEN(),
            gameState: this.engine.gameState,
            timestamp: new Date().toISOString()
        };
    }

    // Add recovery method to help users unstick the game
    recoverGameState() {
        try {
            if (this.ui) {
                const success = this.ui.recoverFromStuckState();
                if (success) {
                    console.log("Game state recovered successfully");
                    return true;
                }
            }
            
            console.log("Basic recovery failed, attempting engine reset");
            
            // More aggressive recovery - keep game history but reset frozen states
            if (this.engine && this.ui) {
                const moveHistory = [...this.engine.moveHistory];
                
                // Only reset if we have a move history to restore
                if (moveHistory.length > 0) {
                    this.engine.reset();
                    
                    // Replay all moves except the last one if it might have caused the hang
                    const movesToReplay = moveHistory.length > 1 ? 
                        moveHistory.slice(0, -1) : moveHistory;
                        
                    for (const move of movesToReplay) {
                        try {
                            this.engine.makeMove(move.from, move.to);
                        } catch (error) {
                            console.error('Error replaying move:', error);
                            break;
                        }
                    }
                    
                    this.ui.moveHandler.isWaitingForLLM = false;
                    this.ui.gameController.updateDisplay();
                    return true;
                } else {
                    // Just start a new game
                    this.resetGame();
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error("Failed to recover game state:", error);
            return false;
        }
    }
    
    // Add a method to force LLM to make a move (useful to recover from stuck states)
    forceLLMMove() {
        if (this.ui) {
            return this.ui.forceLLMMove();
        }
        return false;
    }

    // Add a method for forcing a random move (helpful when completely stuck)
    forceRandomMove() {
        if (this.ui && this.engine && this.engine.currentPlayer === 'black') {
            return this.ui.forceRandomMove();
        }
        console.log("Cannot make random move - not Black's turn or UI not initialized");
        return false;
    }

    // Add a game reset method that keeps the position but resets internal state
    resetGameState() {
        if (!this.engine || !this.ui) {
            console.log("Cannot reset game state - engine or UI not initialized");
            return false;
        }
        
        try {
            console.log("Resetting game state while preserving position...");
            
            // Save current position and history
            const moveHistory = [...this.engine.moveHistory];
            const currentPosition = this.engine.getBoardAsFEN();
            const currentPlayer = this.engine.currentPlayer;
            
            // Reset core components
            if (this.ui.moveHandler) {
                this.ui.moveHandler.isWaitingForLLM = false;
            }
            
            if (this.ui.thinkingDisplay) {
                this.ui.thinkingDisplay.showThinking(false);
                this.ui.thinkingDisplay.showThinkingStreamIndicator(false);
            }
            
            // Update UI
            if (this.ui.gameController) {
                this.ui.gameController.updateDisplay();
            }
            
            console.log("Game state reset - internal state cleared but position preserved");
            return true;
        } catch (error) {
            console.error("Failed to reset game state:", error);
            return false;
        }
    }
}

// Initialize the application
const chessApp = new ChessApp();

// Make it available globally for debugging
window.chessApp = chessApp;

// Add some helpful console commands for debugging
console.log(`
🎮 Chess vs LLM Application Loaded!

Debug commands:
- chessApp.getAppStatus() - Get application status
- chessApp.testLLMConnection() - Test LLM connection
- chessApp.resetGame() - Start a completely new game
- chessApp.resetGameState() - Reset internal state but keep position
- chessApp.exportGame() - Export current game state
- chessApp.recoverGameState() - Recover from stuck state
- chessApp.forceLLMMove() - Force LLM to make a move (helps if Black's turn is stuck)
- chessApp.forceRandomMove() - Force a random move for Black (when completely stuck)

Enjoy playing chess against the LLM! 🏁
`);
