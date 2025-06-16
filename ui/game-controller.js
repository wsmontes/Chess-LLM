class GameController {
    constructor(engine, boardManager, moveHandler, thinkingDisplay) {
        this.engine = engine;
        this.boardManager = boardManager;
        this.moveHandler = moveHandler;
        this.thinkingDisplay = thinkingDisplay;
        this.movesContainer = document.getElementById('moves-container');
        this.statusText = document.getElementById('status-text');
        // Access LLM through moveHandler
        this.llm = this.moveHandler.llm;
        
        // Pass thinking display to move handler
        this.moveHandler.thinkingDisplay = this.thinkingDisplay;
    }

    async handleSquareClick(squareName) {
        if (this.engine.currentPlayer !== 'white') return;
        if (this.moveHandler.isWaitingForLLM) return;
        
        try {
            const piece = this.engine.getPiece(squareName);
            
            if (this.boardManager.selectedSquare === squareName) {
                this.boardManager.clearSelection();
            } else if (this.boardManager.selectedSquare && this.boardManager.possibleMoves.includes(squareName)) {
                await this.makePlayerMove(this.boardManager.selectedSquare, squareName);
            } else if (piece && piece.color === 'white') {
                // Check if player is in check and has valid moves with this piece
                const inCheck = this.engine.isKingInCheck('white');
                const validMoves = this.engine.getValidMoves(squareName);
                
                if (inCheck && validMoves.length === 0) {
                    // If in check and this piece can't help, inform user
                    const kingSquare = this.engine.findKing('white');
                    this.boardManager.highlightCheck(kingSquare);
                    if (piece.type !== 'king') {
                        this.showError("Your king is in check! Move your king or block the check.");
                        return;
                    }
                }
                
                this.boardManager.selectSquare(squareName);
            } else {
                this.boardManager.clearSelection();
            }
        } catch (error) {
            console.error('Error handling square click:', error);
            this.boardManager.clearSelection();
            this.updateDisplay();
        }
    }

    async makePlayerMove(fromSquare, toSquare) {
        try {
            const move = await this.moveHandler.makeMove(fromSquare, toSquare);
            this.updateDisplay();
            this.addMoveToHistory(move);
            
            // Always update game state first
            this.updateStatus();
            
            if (this.engine.gameState === 'checkmate' || 
                this.engine.gameState === 'stalemate' || 
                this.engine.gameState === 'draw') {
                this.handleGameEnd();
                return;
            }
            
            // Get LLM move if game hasn't ended
            if (this.engine.currentPlayer === 'black') {
                await this.getLLMMove();
            }
        } catch (error) {
            console.error('Error making move:', error);
            this.showError('Error making move: ' + error.message);
            this.boardManager.clearSelection();
            this.updateDisplay();
        }
    }

    async getLLMMove() {
        if (this.engine.gameState === 'checkmate' || 
            this.engine.gameState === 'stalemate' || 
            this.engine.gameState === 'draw') {
            console.log('Game is already over, not requesting LLM move');
            return;
        }
        
        // Set a hard timeout for the entire LLM move process
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
            console.error("LLM move process timed out globally");
            this.showError("LLM move timed out - checking game state");
            this.checkAndHandleGameOver();
        }, 90000); // Increased timeout for deep thinking
        
        try {
            this.thinkingDisplay.showThinking(true);
            this.thinkingDisplay.addMoveThinkingHeader(this.engine);
            this.updateStatus('LLM is engaging in deep analysis...');
            this.thinkingDisplay.showThinkingStreamIndicator(true);

            // Try to get a move from the LLM with timeout protection
            const move = await this.moveHandler.getLLMMove();
            clearTimeout(timeoutId);
            
            if (move) {
                this.updateDisplay();
                this.addMoveToHistory(move);
                this.thinkingDisplay.addFinalMoveToThinking(move.notation);
                this.updateStatus();
                
                // Handle game end conditions
                if (this.engine.gameState === 'checkmate' || 
                    this.engine.gameState === 'stalemate' || 
                    this.engine.gameState === 'draw') {
                    this.handleGameEnd();
                }
            } else {
                // No move returned - check if game is over
                this.checkAndHandleGameOver();
            }

        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Error getting LLM move:', error);
            
            this.thinkingDisplay.addErrorToThinking(error.message);
            
            // Check if this is a game over situation
            if (this.checkAndHandleGameOver()) {
                return; // Game is over, no need for recovery
            }
            
            this.showError(`LLM move error: ${error.message}`);
            
            // Give player a chance to see the error before auto-recovery
            setTimeout(() => this.recoverFromFailedMove(), 1500);
            
        } finally {
            clearTimeout(timeoutId);
            this.thinkingDisplay.showThinking(false);
            this.thinkingDisplay.showThinkingStreamIndicator(false);
            this.moveHandler.isWaitingForLLM = false;
            this.updateDisplay();
        }
    }

    // Add method to check and handle game over conditions
    checkAndHandleGameOver() {
        // Force update of game state
        this.engine.updateGameEndingConditions();
        
        if (this.engine.gameState === 'checkmate' || 
            this.engine.gameState === 'stalemate' || 
            this.engine.gameState === 'draw') {
            console.log('Game is over:', this.engine.gameState);
            this.handleGameEnd();
            return true;
        }
        
        return false;
    }

    // Add a recovery method for failed LLM moves
    async recoverFromFailedMove() {
        try {
            console.log("Attempting to recover from failed move...");
            
            // First check if game is actually over
            if (this.checkAndHandleGameOver()) {
                return true; // Game is over, no recovery needed
            }
            
            // Try to make a random move as recovery
            const move = await this.moveHandler.makeRandomMove();
            if (move) {
                console.log("Recovery successful with random move:", move.notation);
                this.updateDisplay();
                this.addMoveToHistory(move);
                this.thinkingDisplay.addFinalMoveToThinking(
                    move.notation + ' (automatic recovery)'
                );
                this.updateStatus();
                
                return true;
            } else {
                // No move returned - check if game is over
                return this.checkAndHandleGameOver();
            }
        } catch (recoveryError) {
            console.error("Recovery failed:", recoveryError);
            
            // Last chance - check if game is over
            if (this.checkAndHandleGameOver()) {
                return true;
            }
            
            this.showError("Game state corrupted - Please start a new game");
            return false;
        }
    }

    handleGameEnd() {
        let title = 'Game Over';
        let message = '';

        switch (this.engine.gameState) {
            case 'checkmate':
                const winner = this.engine.currentPlayer === 'white' ? 'LLM (Black)' : 'You (White)';
                title = winner === 'You (White)' ? 'Congratulations!' : 'Game Over';
                message = `${winner} wins by checkmate!`;
                break;
            case 'stalemate':
                title = 'Draw';
                message = 'The game ended in stalemate.';
                break;
            case 'draw':
                title = 'Draw';
                message = 'The game ended in a draw by the 50-move rule.';
                break;
        }

        this.showGameOverModal(title, message);
    }

    showGameOverModal(title, message) {
        const modal = document.getElementById('game-over-modal');
        const titleElement = document.getElementById('game-result-title');
        const messageElement = document.getElementById('game-result-message');

        titleElement.textContent = title;
        messageElement.textContent = message;
        modal.classList.add('active');
    }

    startNewGame() {
        this.engine.reset();
        this.boardManager.clearSelection();
        this.moveHandler.isWaitingForLLM = false;
        this.thinkingDisplay.showThinking(false);
        this.thinkingDisplay.clearThinkingDisplay();
        
        this.movesContainer.innerHTML = '<div class="no-moves">Game just started</div>';
        this.updateDisplay();
    }

    updateDisplay() {
        this.boardManager.updateDisplay();
        this.updateStatus();
        this.updateControls();
    }

    updateStatus(customStatus = null) {
        if (customStatus) {
            this.statusText.textContent = customStatus;
            return;
        }

        if (this.moveHandler.isWaitingForLLM) {
            return;
        }

        let status = '';
        const currentPlayerName = this.engine.currentPlayer === 'white' ? 'White' : 'Black';
        const playerDescription = this.engine.currentPlayer === 'white' ? 'Your turn' : 'LLM\'s turn';

        switch (this.engine.gameState) {
            case 'check':
                status = `${playerDescription} - ${currentPlayerName} is in check! Find a way to escape.`;
                break;
            case 'checkmate':
                const winner = this.engine.currentPlayer === 'white' ? 'Black (LLM)' : 'White (You)';
                status = `Checkmate! ${winner} wins!`;
                break;
            case 'stalemate':
                status = 'Stalemate - Draw!';
                break;
            case 'draw':
                status = 'Draw by 50-move rule!';
                break;
            default:
                status = `${playerDescription} - ${currentPlayerName} to move`;
        }

        this.statusText.textContent = status;
    }

    updateControls() {
        const undoBtn = document.getElementById('undo-btn');
        undoBtn.disabled = this.engine.moveHistory.length === 0 || this.moveHandler.isWaitingForLLM;

        const hintBtn = document.getElementById('hint-btn');
        hintBtn.disabled = this.engine.currentPlayer !== 'white' || this.moveHandler.isWaitingForLLM || this.engine.gameState === 'checkmate';
    }

    addMoveToHistory(move) {
        const moveEntry = document.createElement('div');
        moveEntry.className = 'move-entry';
        
        const moveNumber = Math.ceil(this.engine.moveHistory.length / 2);
        const isWhiteMove = this.engine.moveHistory.length % 2 === 1;
        
        moveEntry.innerHTML = `
            <span class="move-number">${isWhiteMove ? moveNumber + '.' : ''}</span>
            <span class="move-notation">${move.notation}</span>
        `;

        const noMoves = this.movesContainer.querySelector('.no-moves');
        if (noMoves) {
            noMoves.remove();
        }

        this.movesContainer.appendChild(moveEntry);
        this.movesContainer.scrollTop = this.movesContainer.scrollHeight;
    }

    // Implement undo functionality
    undoMove() {
        if (this.engine.moveHistory.length === 0) return;
        
        const movesToUndo = this.engine.currentPlayer === 'white' ? 1 : 2;
        const moveHistory = [...this.engine.moveHistory];
        
        // Get history except for moves being undone
        const newHistory = moveHistory.slice(0, -movesToUndo);
        
        // Reset and replay
        this.engine.reset();
        this.movesContainer.innerHTML = '<div class="no-moves">Game just started</div>';
        
        // Replay moves
        for (const move of newHistory) {
            try {
                const newMove = this.engine.makeMove(move.from, move.to);
                this.addMoveToHistory(newMove);
            } catch (error) {
                console.error('Error replaying move:', error);
                break;
            }
        }
        
        this.updateDisplay();
    }

    // Make the error display more prominent
    showError(message) {
        console.error("GAME ERROR:", message);
        
        const statusElement = document.getElementById('status-text');
        const originalText = statusElement.textContent;
        statusElement.textContent = `⚠️ ${message}`;
        statusElement.style.color = 'rgb(244, 67, 54)';
        statusElement.style.fontWeight = 'bold';
        
        // Restore original status after showing the error
        setTimeout(() => {
            statusElement.textContent = originalText;
            statusElement.style.color = '';
            statusElement.style.fontWeight = '';
        }, 5000);
    }
}
