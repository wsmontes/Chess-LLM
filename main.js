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
- chessApp.resetGame() - Reset the game
- chessApp.exportGame() - Export current game state

Enjoy playing chess against the LLM! 🏁
`);
