class ChessUI {
    constructor(chessEngine, llmClient) {
        this.engine = chessEngine;
        this.llm = llmClient;
        this.selectedSquare = null;
        this.possibleMoves = [];
        this.isWaitingForLLM = false;
        this.boardElement = document.getElementById('chess-board');
        this.movesContainer = document.getElementById('moves-container');
        this.statusText = document.getElementById('status-text');
        this.thinkingIndicator = document.getElementById('thinking-indicator');
        this.thinkingContent = document.getElementById('thinking-content');
        this.thinkingToggle = document.getElementById('thinking-toggle');
        this.isThinkingVisible = true;
        this.currentThinkingSteps = [];
        
        // Initialize secure storage for API keys
        this.secureStorage = new SecureStorage();
        
        this.initializeBoard();
        this.initializeEventListeners();
        this.updateDisplay();
        
        // Set up LLM thinking callback
        this.llm.setThinkingCallback((steps) => this.updateThinkingDisplay(steps));
        
        // Load saved settings
        this.loadSettings();
    }

    initializeBoard() {
        this.boardElement.innerHTML = '';
        
        let squareCount = 0;
        // Create board from rank 8 to rank 1 (from top to bottom visually)
        for (let rank = 7; rank >= 0; rank--) {
            for (let file = 0; file < 8; file++) {
                const square = document.createElement('div');
                const squareName = this.engine.squareToString(file, rank);
                squareCount++;
                
                // Fix square coloring: a1 should be dark, h1 should be light
                square.className = `square ${(rank + file) % 2 === 1 ? 'light' : 'dark'}`;
                square.dataset.square = squareName;
                
                // Add piece if it exists
                const piece = this.engine.board[rank][file];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = 'piece';
                    pieceElement.textContent = piece.symbol;
                    pieceElement.draggable = true;
                    square.appendChild(pieceElement);
                }
                
                this.boardElement.appendChild(square);
            }
        }
        console.log(`Created ${squareCount} squares on the board`);
    }

    initializeEventListeners() {
        // Board click events
        this.boardElement.addEventListener('click', (e) => {
            if (this.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square) {
                this.handleSquareClick(square.dataset.square);
            }
        });

        // Drag and drop events
        this.boardElement.addEventListener('dragstart', (e) => {
            if (this.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square && e.target.classList.contains('piece')) {
                this.handleDragStart(square.dataset.square, e);
            }
        });

        this.boardElement.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.boardElement.addEventListener('drop', (e) => {
            if (this.isWaitingForLLM) return;
            
            e.preventDefault();
            const square = e.target.closest('.square');
            if (square) {
                this.handleDrop(square.dataset.square);
            }
        });

        // Control buttons
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.startNewGame();
        });

        document.getElementById('undo-btn').addEventListener('click', () => {
            this.undoMove();
        });

        document.getElementById('hint-btn').addEventListener('click', () => {
            this.getHint();
        });

        // Modal buttons
        document.getElementById('new-game-modal-btn').addEventListener('click', () => {
            this.closeModal();
            this.startNewGame();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // LLM settings
        document.getElementById('llm-provider').addEventListener('change', (e) => {
            this.handleProviderChange(e.target.value);
        });

        document.getElementById('llm-temperature').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('temperature-value').textContent = value.toFixed(1);
            this.llm.setTemperature(value);
            this.saveSettings();
        });

        // LM Studio settings
        document.getElementById('llm-model').addEventListener('change', (e) => {
            this.llm.setModel(e.target.value);
            this.saveSettings();
        });

        document.getElementById('llm-endpoint').addEventListener('change', (e) => {
            this.llm.setEndpoint(e.target.value);
            this.saveSettings();
            this.testConnection();
        });

        // OpenAI settings - Load API key from secure storage
        document.getElementById('openai-api-key').addEventListener('input', (e) => {
            const apiKey = e.target.value.trim();
            this.llm.setOpenAIApiKey(apiKey);
            
            // Debounce saving to avoid too frequent saves
            clearTimeout(this.apiKeySaveTimeout);
            this.apiKeySaveTimeout = setTimeout(() => {
                this.saveSettings();
                if (apiKey) {
                    this.testConnection();
                }
            }, 1000);
        });

        // Add paste event handler for API key
        document.getElementById('openai-api-key').addEventListener('paste', (e) => {
            setTimeout(() => {
                const apiKey = e.target.value.trim();
                if (apiKey.startsWith('sk-')) {
                    this.llm.setOpenAIApiKey(apiKey);
                    this.saveSettings();
                    this.testConnection();
                }
            }, 100);
        });

        // Add clear API key button functionality
        this.addClearApiKeyButton();

        // Thinking toggle
        this.thinkingToggle.addEventListener('change', (e) => {
            this.isThinkingVisible = e.target.checked;
            this.thinkingContent.classList.toggle('hidden', !this.isThinkingVisible);
        });

        // Test connection on load
        this.testConnection();
    }

    handleSquareClick(squareName) {
        if (this.engine.currentPlayer !== 'white') return; // Only allow human moves when it's white's turn
        
        const piece = this.engine.getPiece(squareName);
        
        if (this.selectedSquare === squareName) {
            // Deselect
            this.clearSelection();
        } else if (this.selectedSquare && this.possibleMoves.includes(squareName)) {
            // Make move
            this.makeMove(this.selectedSquare, squareName);
        } else if (piece && piece.color === 'white') {
            // Select piece
            this.selectSquare(squareName);
        } else {
            // Clear selection if clicking elsewhere
            this.clearSelection();
        }
    }

    handleDragStart(squareName, event) {
        if (this.engine.currentPlayer !== 'white') {
            event.preventDefault();
            return;
        }
        
        const piece = this.engine.getPiece(squareName);
        if (!piece || piece.color !== 'white') {
            event.preventDefault();
            return;
        }
        
        this.selectSquare(squareName);
        event.dataTransfer.setData('text/plain', squareName);
    }

    handleDrop(toSquare) {
        if (this.selectedSquare && this.possibleMoves.includes(toSquare)) {
            this.makeMove(this.selectedSquare, toSquare);
        } else {
            this.clearSelection();
        }
    }

    selectSquare(squareName) {
        this.clearSelection();
        
        const validMoves = this.engine.getValidMoves(squareName);
        if (validMoves.length === 0) return;
        
        this.selectedSquare = squareName;
        this.possibleMoves = validMoves;
        
        // Update visual feedback
        this.updateBoardHighlights();
    }

    clearSelection() {
        this.selectedSquare = null;
        this.possibleMoves = [];
        this.updateBoardHighlights();
    }

    updateBoardHighlights() {
        // Clear all highlights
        const squares = this.boardElement.querySelectorAll('.square');
        squares.forEach(square => {
            square.classList.remove('selected', 'possible-move', 'last-move');
        });

        // Highlight selected square
        if (this.selectedSquare) {
            const selectedElement = this.boardElement.querySelector(`[data-square="${this.selectedSquare}"]`);
            if (selectedElement) {
                selectedElement.classList.add('selected');
            }
        }

        // Highlight possible moves
        this.possibleMoves.forEach(move => {
            const moveElement = this.boardElement.querySelector(`[data-square="${move}"]`);
            if (moveElement) {
                moveElement.classList.add('possible-move');
            }
        });

        // Highlight last move
        if (this.engine.moveHistory.length > 0) {
            const lastMove = this.engine.moveHistory[this.engine.moveHistory.length - 1];
            const fromElement = this.boardElement.querySelector(`[data-square="${lastMove.from}"]`);
            const toElement = this.boardElement.querySelector(`[data-square="${lastMove.to}"]`);
            
            if (fromElement) fromElement.classList.add('last-move');
            if (toElement) toElement.classList.add('last-move');
        }
    }

    async makeMove(fromSquare, toSquare) {
        try {
            // Validate move using engine's validation
            const validMoves = this.engine.getValidMoves(fromSquare);
            if (!validMoves.includes(toSquare)) {
                this.showError('Invalid move');
                this.clearSelection();
                return;
            }

            // Make the move
            const move = this.engine.makeMove(fromSquare, toSquare);
            this.clearSelection();
            
            // Update display
            this.updateDisplay();
            this.addMoveToHistory(move);
            
            // Check if we need to analyze for checkmate
            await this.handleGameStateAfterMove();

        } catch (error) {
            console.error('Error making move:', error);
            this.showError('Error making move: ' + error.message);
            this.clearSelection();
        }
    }

    async handleGameStateAfterMove() {
        // If someone is in check, ask LLM to analyze if it's checkmate
        if (this.engine.gameState === 'check') {
            const playerInCheck = this.engine.currentPlayer;
            
            // Show analysis indicator
            this.updateStatus(`Analyzing position... ${playerInCheck} is in check`);
            
            // First, do a quick engine check to see if it's obviously not checkmate
            const hasLegalMoves = this.engine.hasValidMovesForPlayer(playerInCheck);
            console.log(`Player ${playerInCheck} in check - has legal moves: ${hasLegalMoves}`);
            
            if (hasLegalMoves) {
                console.log('Engine confirms legal moves exist - definitely not checkmate');
                // Don't even ask LLM if engine confirms there are legal moves
                this.engine.gameState = 'check';
            } else {
                console.log('Engine says no legal moves - asking LLM for confirmation');
                try {
                    const analysis = await this.llm.analyzeCheckPosition(
                        this.engine, 
                        this.engine.moveHistory, 
                        playerInCheck
                    );
                    
                    console.log('LLM analysis result:', analysis);
                    
                    if (analysis === 'checkmate') {
                        this.engine.setCheckmate();
                        console.log('Game ended - checkmate confirmed');
                    } else {
                        console.log('LLM says check only - continuing game');
                    }
                    
                } catch (error) {
                    console.warn('Failed to analyze check position:', error);
                    // Continue with just 'check' status if analysis fails
                }
            }
        }
        
        // Handle game ending
        if (this.engine.gameState === 'checkmate' || this.engine.gameState === 'stalemate' || this.engine.gameState === 'draw') {
            this.handleGameEnd();
            return;
        }

        // IMPORTANT: Always update status after analyzing check position
        this.updateStatus();

        // Get LLM move if it's black's turn and game is still playing
        if (this.engine.currentPlayer === 'black' && this.engine.gameState !== 'checkmate') {
            await this.getLLMMove();
        }
    }

    async getLLMMove(previousAttempt = null, attemptCount = 0) {
        if (this.isWaitingForLLM) return;
        
        const maxAttempts = 3;
        
        this.isWaitingForLLM = true;
        this.showThinking(true);
        
        if (attemptCount === 0) {
            this.updateStatus('LLM is thinking...');
            this.addMoveThinkingHeader();
        } else {
            this.updateStatus(`LLM correcting move (attempt ${attemptCount + 1}/${maxAttempts})...`);
            this.addRetryThinkingHeader(attemptCount, previousAttempt);
        }
        
        this.showThinkingStreamIndicator(true);

        try {
            // Test connection first
            const connectionTest = await this.llm.testConnection();
            if (!connectionTest.success) {
                throw new Error('Not connected to LM Studio: ' + connectionTest.message);
            }

            // Get move from LLM - pass attempt count for better feedback
            let moveNotation;
            try {
                const attemptData = previousAttempt ? {
                    ...previousAttempt,
                    attemptNumber: attemptCount + 1
                } : null;
                moveNotation = await this.llm.getChessMove(this.engine, this.engine.moveHistory, attemptData);
            } catch (parseError) {
                // Check if this is a confirmation request
                if (parseError.message.includes('requesting confirmation') || 
                    parseError.message.includes('confirmation failed')) {
                    this.addConfirmationRequestToThinking();
                    this.updateStatus('Requesting move clarification from LLM...');
                    
                    // The LLM client will handle the confirmation internally
                    throw parseError;
                } else {
                    throw parseError;
                }
            }
            
            // Validate the move before executing
            const validationResult = this.validateLLMMove(moveNotation);
            
            if (!validationResult.isValid) {
                this.addValidationErrorToThinking(moveNotation, validationResult.reason);
                
                if (attemptCount < maxAttempts - 1) {
                    this.showThinkingStreamIndicator(false);
                    const newAttempt = {
                        move: moveNotation,
                        reason: validationResult.reason,
                        availableMoves: validationResult.availableMoves,
                        piecePositions: validationResult.piecePositions,
                        currentPosition: validationResult.currentPosition,
                        attemptNumber: attemptCount + 1
                    };
                    // Add small delay before retry
                    setTimeout(() => {
                        this.getLLMMove(newAttempt, attemptCount + 1);
                    }, 1000);
                    return;
                } else {
                    throw new Error(`LLM failed to provide valid move after ${maxAttempts} attempts. Last attempt: "${moveNotation}" - ${validationResult.reason}`);
                }
            }
            
            // Convert notation to move and execute
            const move = this.parseAndExecuteMove(moveNotation);
            
            if (move) {
                this.updateDisplay();
                this.addMoveToHistory(move);
                this.addFinalMoveToThinking(moveNotation);
                
                if (attemptCount > 0) {
                    this.addSuccessAfterRetryToThinking(attemptCount + 1);
                }
                
                // Handle game state after LLM move
                await this.handleGameStateAfterMove();
            }

        } catch (error) {
            console.error('Error getting LLM move:', error);
            this.showError('LLM Error: ' + error.message);
            this.addErrorToThinking(error.message);
            
            // Fall back to random move
            await this.makeRandomMove();
        } finally {
            this.isWaitingForLLM = false;
            this.showThinking(false);
            this.showThinkingStreamIndicator(false);
            // IMPORTANT: Always update status and display when LLM is done
            this.updateStatus();
            this.updateDisplay();
        }
    }

    addConfirmationRequestToThinking() {
        if (!this.isThinkingVisible) return;
        
        const confirmationStep = {
            type: 'confirmation-request',
            content: `🔄 Move unclear - requesting clarification from LLM`
        };
        
        const stepElement = this.createThinkingStep(confirmationStep, 0);
        stepElement.style.borderLeftColor = '#2196F3';
        stepElement.style.background = 'rgba(33, 150, 243, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    validateLLMMove(moveNotation) {
        try {
            // Get all possible moves for black pieces
            const possibleMoves = [];
            const piecePositions = new Map(); // Track where each piece type is located
            
            for (let rank = 0; rank < 8; rank++) {
                for (let file = 0; file < 8; file++) {
                    const piece = this.engine.board[rank][file];
                    if (piece && piece.color === 'black') {
                        const square = this.engine.squareToString(file, rank);
                        const moves = this.engine.getValidMoves(square);
                        
                        // Track piece positions for better error messages
                        if (!piecePositions.has(piece.type)) {
                            piecePositions.set(piece.type, []);
                        }
                        piecePositions.get(piece.type).push(square);
                        
                        moves.forEach(move => {
                            const notation = this.engine.generateMoveNotation(square, move, piece, this.engine.getPiece(move));
                            possibleMoves.push({
                                from: square,
                                to: move,
                                piece: piece.type,
                                notation: notation
                            });
                        });
                    }
                }
            }

            const availableMoves = possibleMoves.map(m => m.notation);
            
            // Try to find matching move
            const matchingMove = this.findBestMoveMatch(moveNotation, possibleMoves);
            
            if (!matchingMove) {
                let reason = this.generateDetailedMoveError(moveNotation, possibleMoves, piecePositions);
                
                return {
                    isValid: false,
                    reason: reason,
                    availableMoves: availableMoves,
                    piecePositions: Object.fromEntries(piecePositions),
                    currentPosition: this.engine.getBoardAsFEN()
                };
            }
            
            return { isValid: true };
            
        } catch (error) {
            return {
                isValid: false,
                reason: `Error validating move: ${error.message}`,
                availableMoves: [],
                piecePositions: {},
                currentPosition: this.engine.getBoardAsFEN()
            };
        }
    }

    generateDetailedMoveError(moveNotation, possibleMoves, piecePositions) {
        let reason = `Move "${moveNotation}" is not legal in the current position.\n\n`;
        
        // Analyze the attempted move pattern
        const cleanMove = moveNotation.trim();
        
        // Check for specific error patterns
        if (/^[KQRBN][a-h][1-8]$/.test(cleanMove)) {
            // Piece move to specific square
            const pieceType = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            }[cleanMove[0]];
            const destination = cleanMove.slice(1);
            
            const piecesOfType = possibleMoves.filter(m => m.piece === pieceType);
            const currentPositions = piecePositions.get(pieceType) || [];
            
            if (piecesOfType.length === 0) {
                reason += `PROBLEM: No ${pieceType} can move right now.\n`;
                reason += `CURRENT POSITION: Your ${pieceType} is on ${currentPositions.join(', ')}\n`;
                reason += `BLOCKING ISSUE: The ${pieceType} is blocked by other pieces or cannot reach any squares.\n\n`;
            } else {
                const validDestinations = [...new Set(piecesOfType.map(m => m.to))];
                reason += `PROBLEM: Your ${pieceType} cannot move to ${destination}.\n`;
                reason += `CURRENT POSITION: Your ${pieceType} is on ${currentPositions.join(', ')}\n`;
                reason += `VALID DESTINATIONS: ${validDestinations.join(', ')}\n\n`;
            }
            
        } else if (/^[a-h][1-8]$/.test(cleanMove)) {
            // Pawn move
            const destination = cleanMove;
            const pawnMoves = possibleMoves.filter(m => m.piece === 'pawn');
            const pawnPositions = piecePositions.get('pawn') || [];
            
            if (pawnMoves.length === 0) {
                reason += `PROBLEM: No pawns can move right now.\n`;
                reason += `CURRENT POSITION: Your pawns are on ${pawnPositions.join(', ')}\n`;
                reason += `BLOCKING ISSUE: All pawns are blocked or cannot advance.\n\n`;
            } else {
                const validPawnDestinations = [...new Set(pawnMoves.map(m => m.to))];
                reason += `PROBLEM: No pawn can move to ${destination}.\n`;
                reason += `CURRENT POSITION: Your pawns are on ${pawnPositions.join(', ')}\n`;
                reason += `VALID PAWN MOVES: ${validPawnDestinations.join(', ')}\n\n`;
            }
            
        } else if (cleanMove.includes('x')) {
            // Capture move
            const capturePattern = /^([KQRBN]?)([a-h]?)x([a-h][1-8])$/;
            const match = capturePattern.exec(cleanMove);
            
            if (match) {
                const [, pieceSymbol, fromFile, targetSquare] = match;
                const targetPiece = this.engine.getPiece(targetSquare);
                
                reason += `PROBLEM: Capture move "${cleanMove}" is not possible.\n`;
                
                if (!targetPiece) {
                    reason += `TARGET SQUARE: ${targetSquare} is empty - nothing to capture.\n`;
                } else if (targetPiece.color === 'black') {
                    reason += `TARGET SQUARE: ${targetSquare} contains your own ${targetPiece.type} - cannot capture own pieces.\n`;
                } else {
                    reason += `TARGET SQUARE: ${targetSquare} contains opponent's ${targetPiece.type}, but no piece can capture it.\n`;
                    
                    // Show which pieces could potentially capture
                    const captureMoves = possibleMoves.filter(m => m.to === targetSquare);
                    if (captureMoves.length > 0) {
                        reason += `AVAILABLE CAPTURES: ${captureMoves.map(m => m.notation).join(', ')}\n`;
                    }
                }
                reason += '\n';
            }
            
        } else if (/^[Oo0]/.test(cleanMove)) {
            // Castling
            reason += `PROBLEM: Castling "${cleanMove}" is not possible.\n`;
            const canKingside = this.engine.canCastle('black', 'kingside');
            const canQueenside = this.engine.canCastle('black', 'queenside');
            
            reason += `KINGSIDE CASTLING: ${canKingside ? 'Available' : 'Not available'}\n`;
            reason += `QUEENSIDE CASTLING: ${canQueenside ? 'Available' : 'Not available'}\n`;
            
            if (!canKingside && !canQueenside) {
                reason += `REASON: King or rook has moved, or king is in check, or squares are occupied.\n`;
            }
            reason += '\n';
            
        } else {
            // Unrecognized move format
            reason += `PROBLEM: Move format "${cleanMove}" is not recognized.\n`;
            reason += `EXPECTED FORMATS:\n`;
            reason += `- Pawn moves: e5, d6, etc.\n`;
            reason += `- Piece moves: Nf6, Bb5, Qd8, etc.\n`;
            reason += `- Captures: exd5, Nxf6, etc.\n`;
            reason += `- Castling: O-O (kingside), O-O-O (queenside)\n\n`;
        }
        
        // Add analysis of current position
        reason += `CURRENT POSITION ANALYSIS:\n`;
        reason += `- Move number: ${Math.ceil((this.engine.moveHistory.length + 1) / 2)}\n`;
        reason += `- You are playing as BLACK\n`;
        reason += `- It's your turn to move\n`;
        
        // Show piece development status
        const developedPieces = [];
        const undevelopedPieces = [];
        
        for (const [pieceType, positions] of piecePositions.entries()) {
            if (pieceType === 'pawn') continue;
            
            const startingSquares = this.getStartingSquares('black', pieceType);
            const developed = positions.filter(pos => !startingSquares.includes(pos));
            const undeveloped = positions.filter(pos => startingSquares.includes(pos));
            
            if (developed.length > 0) {
                developedPieces.push(`${pieceType}: ${developed.join(', ')}`);
            }
            if (undeveloped.length > 0) {
                undevelopedPieces.push(`${pieceType}: ${undeveloped.join(', ')}`);
            }
        }
        
        if (developedPieces.length > 0) {
            reason += `- Developed pieces: ${developedPieces.join('; ')}\n`;
        }
        if (undevelopedPieces.length > 0) {
            reason += `- Undeveloped pieces: ${undevelopedPieces.join('; ')}\n`;
        }
        
        reason += '\n';
        
        // Show top 5 recommended moves
        const topMoves = possibleMoves.slice(0, 5).map(m => m.notation);
        reason += `RECOMMENDED MOVES (choose one): ${topMoves.join(', ')}`;
        
        return reason;
    }

    getStartingSquares(color, pieceType) {
        const startingSquares = {
            'black': {
                'rook': ['a8', 'h8'],
                'knight': ['b8', 'g8'],
                'bishop': ['c8', 'f8'],
                'queen': ['d8'],
                'king': ['e8']
            },
            'white': {
                'rook': ['a1', 'h1'],
                'knight': ['b1', 'g1'],
                'bishop': ['c1', 'f1'],
                'queen': ['d1'],
                'king': ['e1']
            }
        };
        
        return startingSquares[color]?.[pieceType] || [];
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

    closeModal() {
        const modal = document.getElementById('game-over-modal');
        modal.classList.remove('active');
    }

    startNewGame() {
        this.engine.reset();
        this.clearSelection();
        this.isWaitingForLLM = false;
        this.showThinking(false);
        this.clearThinkingDisplay(); // Only clear on new game
        
        // Clear move history display
        this.movesContainer.innerHTML = '<div class="no-moves">Game just started</div>';
        
        this.updateDisplay();
    }

    undoMove() {
        if (this.engine.moveHistory.length === 0) return;

        // Undo last two moves (human and LLM) to get back to human's turn
        const movesToUndo = this.engine.currentPlayer === 'white' ? 1 : 2;
        
        for (let i = 0; i < movesToUndo && this.engine.moveHistory.length > 0; i++) {
            this.engine.moveHistory.pop();
            // Note: This is a simplified undo - a full implementation would need to restore board state
        }

        // For simplicity, restart the game and replay moves
        // A more sophisticated approach would maintain board history
        this.replayGame();
    }

    replayGame() {
        const moveHistory = [...this.engine.moveHistory];
        this.engine.reset();
        
        // Clear display
        this.movesContainer.innerHTML = '<div class="no-moves">Game just started</div>';
        
        // Replay moves
        for (const move of moveHistory) {
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

    async getHint() {
        if (this.engine.currentPlayer !== 'white' || this.isWaitingForLLM) return;

        try {
            this.showThinking(true);
            const hint = await this.llm.getHint(this.engine, this.engine.moveHistory, 'white');
            this.showThinking(false);
            
            alert(`Hint: ${hint}`);
        } catch (error) {
            this.showThinking(false);
            this.showError('Could not get hint: ' + error.message);
        }
    }

    async testConnection() {
        const result = await this.llm.testConnection();
        this.updateConnectionStatus(result);
    }

    handleProviderChange(provider) {
        this.llm.setProvider(provider);
        
        // Show/hide relevant settings
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
        this.testConnection();
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
            
            // OpenAI settings - Load API key from secure storage
            if (settings.openai) {
                // Load API key from secure storage
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
            
            // Show API key status
            this.updateApiKeyStatus();
            
        } catch (error) {
            console.warn('Could not load settings:', error);
            this.showApiKeyError('Failed to load saved settings');
        }
    }

    saveSettings() {
        try {
            // Save API key to secure storage
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
                    // Don't store API key in localStorage for security
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

    updateApiKeyStatus() {
        const apiKeyInput = document.getElementById('openai-api-key');
        const hasApiKey = this.llm.openaiApiKey && this.llm.openaiApiKey.length > 0;
        
        // Add visual indicator for API key status
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

    // Enhanced API key input handler
    initializeEventListeners() {
        // Board click events
        this.boardElement.addEventListener('click', (e) => {
            if (this.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square) {
                this.handleSquareClick(square.dataset.square);
            }
        });

        // Drag and drop events
        this.boardElement.addEventListener('dragstart', (e) => {
            if (this.isWaitingForLLM) return;
            
            const square = e.target.closest('.square');
            if (square && e.target.classList.contains('piece')) {
                this.handleDragStart(square.dataset.square, e);
            }
        });

        this.boardElement.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.boardElement.addEventListener('drop', (e) => {
            if (this.isWaitingForLLM) return;
            
            e.preventDefault();
            const square = e.target.closest('.square');
            if (square) {
                this.handleDrop(square.dataset.square);
            }
        });

        // Control buttons
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.startNewGame();
        });

        document.getElementById('undo-btn').addEventListener('click', () => {
            this.undoMove();
        });

        document.getElementById('hint-btn').addEventListener('click', () => {
            this.getHint();
        });

        // Modal buttons
        document.getElementById('new-game-modal-btn').addEventListener('click', () => {
            this.closeModal();
            this.startNewGame();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // LLM settings
        document.getElementById('llm-provider').addEventListener('change', (e) => {
            this.handleProviderChange(e.target.value);
        });

        document.getElementById('llm-temperature').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('temperature-value').textContent = value.toFixed(1);
            this.llm.setTemperature(value);
            this.saveSettings();
        });

        // LM Studio settings
        document.getElementById('llm-model').addEventListener('change', (e) => {
            this.llm.setModel(e.target.value);
            this.saveSettings();
        });

        document.getElementById('llm-endpoint').addEventListener('change', (e) => {
            this.llm.setEndpoint(e.target.value);
            this.saveSettings();
            this.testConnection();
        });

        // OpenAI settings with enhanced API key handling
        document.getElementById('openai-api-key').addEventListener('input', (e) => {
            const apiKey = e.target.value.trim();
            this.llm.setOpenAIApiKey(apiKey);
            
            // Debounce saving to avoid too frequent saves
            clearTimeout(this.apiKeySaveTimeout);
            this.apiKeySaveTimeout = setTimeout(() => {
                this.saveSettings();
                if (apiKey) {
                    this.testConnection();
                }
            }, 1000);
        });

        // Add paste event handler for API key
        document.getElementById('openai-api-key').addEventListener('paste', (e) => {
            setTimeout(() => {
                const apiKey = e.target.value.trim();
                if (apiKey.startsWith('sk-')) {
                    this.llm.setOpenAIApiKey(apiKey);
                    this.saveSettings();
                    this.testConnection();
                }
            }, 100);
        });

        // Add clear API key button functionality
        this.addClearApiKeyButton();

        // Thinking toggle
        this.thinkingToggle.addEventListener('change', (e) => {
            this.isThinkingVisible = e.target.checked;
            this.thinkingContent.classList.toggle('hidden', !this.isThinkingVisible);
        });

        // Test connection on load
        this.testConnection();
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

    clearApiKey() {
        this.llm.setOpenAIApiKey('');
        document.getElementById('openai-api-key').value = '';
        this.secureStorage.removeApiKey('openai');
        this.saveSettings();
        this.updateApiKeyStatus();
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

    updateThinkingDisplay(steps) {
        this.currentThinkingSteps = steps;
        
        if (!this.isThinkingVisible) return;

        // Find the current move's thinking section (after the last header)
        const headers = this.thinkingContent.querySelectorAll('.thinking-move-header');
        const lastHeader = headers[headers.length - 1];
        
        // Remove all thinking steps after the last header (current move's thinking)
        if (lastHeader) {
            let nextElement = lastHeader.nextElementSibling;
            while (nextElement) {
                const toRemove = nextElement;
                nextElement = nextElement.nextElementSibling;
                if (!toRemove.classList.contains('thinking-move-header') && 
                    !toRemove.classList.contains('thinking-stream-indicator') &&
                    !toRemove.classList.contains('thinking-retry-header')) {
                    toRemove.remove();
                }
            }
        }

        // Remove stream indicator if it exists
        const indicator = this.thinkingContent.querySelector('.thinking-stream-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Add current thinking steps
        steps.forEach((step, index) => {
            const stepElement = this.createThinkingStep(step, index);
            this.thinkingContent.appendChild(stepElement);
        });

        // Auto-scroll to bottom
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addRetryThinkingHeader(attemptNumber, previousAttempt) {
        if (!this.isThinkingVisible) return;
        
        const headerElement = document.createElement('div');
        headerElement.className = 'thinking-retry-header';
        headerElement.innerHTML = `
            <div class="thinking-retry-separator"></div>
            <div class="thinking-retry-title">
                <i class="fas fa-redo"></i>
                Retry Attempt ${attemptNumber + 1} - Correcting "${previousAttempt.move}"
            </div>
        `;
        
        this.thinkingContent.appendChild(headerElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addValidationErrorToThinking(moveNotation, reason) {
        if (!this.isThinkingVisible) return;
        
        const errorStep = {
            type: 'validation-error',
            content: `❌ Invalid move attempted: "${moveNotation}"\nReason: ${reason}`
        };
        
        const stepElement = this.createThinkingStep(errorStep, 0);
        stepElement.style.borderLeftColor = '#ff9800';
        stepElement.style.background = 'rgba(255, 152, 0, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addSuccessAfterRetryToThinking(totalAttempts) {
        if (!this.isThinkingVisible) return;
        
        const successStep = {
            type: 'retry-success',
            content: `✅ Valid move found after ${totalAttempts} attempts`
        };
        
        const stepElement = this.createThinkingStep(successStep, 0);
        stepElement.style.borderLeftColor = '#4caf50';
        stepElement.style.background = 'rgba(76, 175, 80, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    createThinkingStep(step, index) {
        const stepElement = document.createElement('div');
        stepElement.className = `thinking-step ${step.type}`;
        
        const labels = {
            'analysis': 'Position Analysis',
            'evaluation': 'Move Evaluation',
            'decision': 'Decision Making',
            'final': 'Final Move',
            'validation-error': 'Move Validation Error',
            'retry-success': 'Retry Success',
            'confirmation-request': 'Move Clarification'
        };

        stepElement.innerHTML = `
            <div class="thinking-step-label">${labels[step.type] || 'Thinking'}</div>
            <div class="thinking-step-content">${this.escapeHtml(step.content)}</div>
        `;

        return stepElement;
    }

    clearThinkingDisplay() {
        this.currentThinkingSteps = [];
        this.thinkingContent.innerHTML = '';
    }

    showThinkingStreamIndicator(show) {
        const existing = this.thinkingContent.querySelector('.thinking-stream-indicator');
        
        if (show && !existing) {
            const indicator = document.createElement('div');
            indicator.className = 'thinking-stream-indicator';
            indicator.innerHTML = `
                <i class="fas fa-brain"></i>
                <span>LLM is analyzing the position...</span>
            `;
            this.thinkingContent.appendChild(indicator);
        } else if (!show && existing) {
            existing.remove();
        }
    }

    addFinalMoveToThinking(move) {
        const finalStep = {
            type: 'final',
            content: `Selected move: ${move}`
        };
        
        this.currentThinkingSteps.push(finalStep);
        
        if (this.isThinkingVisible) {
            const stepElement = this.createThinkingStep(finalStep, this.currentThinkingSteps.length - 1);
            this.thinkingContent.appendChild(stepElement);
            this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
        }
    }

    addErrorToThinking(error) {
        const errorStep = {
            type: 'error',
            content: `Error: ${error}`
        };
        
        if (this.isThinkingVisible) {
            const stepElement = this.createThinkingStep(errorStep, 0);
            stepElement.style.borderLeftColor = '#f44336';
            stepElement.style.background = 'rgba(244, 67, 54, 0.05)';
            this.thinkingContent.appendChild(stepElement);
        }
    }

    addMoveThinkingHeader() {
        if (!this.isThinkingVisible) return;
        
        // Only add header if this isn't the first move or if there's already content
        const hasExistingContent = this.thinkingContent.children.length > 0 && 
            !this.thinkingContent.querySelector('.thinking-placeholder');
        
        if (hasExistingContent) {
            const moveNumber = Math.ceil((this.engine.moveHistory.length + 1) / 2);
            const headerElement = document.createElement('div');
            headerElement.className = 'thinking-move-header';
            headerElement.innerHTML = `
                <div class="thinking-move-separator"></div>
                <div class="thinking-move-title">
                    <i class="fas fa-chess"></i>
                    Move ${moveNumber} - Black's Turn
                </div>
            `;
            
            this.thinkingContent.appendChild(headerElement);
        } else {
            // For the first move, just add the title without separator
            const moveNumber = Math.ceil((this.engine.moveHistory.length + 1) / 2);
            const headerElement = document.createElement('div');
            headerElement.className = 'thinking-move-header';
            headerElement.innerHTML = `
                <div class="thinking-move-title">
                    <i class="fas fa-chess"></i>
                    Move ${moveNumber} - Black's Turn
                </div>
            `;
            
            // Remove placeholder if it exists
            const placeholder = this.thinkingContent.querySelector('.thinking-placeholder');
            if (placeholder) {
                placeholder.remove();
            }
            
            this.thinkingContent.appendChild(headerElement);
        }
        
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    parseAndExecuteMove(moveNotation) {
        try {
            console.log('Attempting to parse move:', moveNotation);
            console.log('Current player:', this.engine.currentPlayer);
            console.log('Current FEN:', this.engine.getBoardAsFEN());
            
            // Get all possible moves for black pieces
            const possibleMoves = [];
            
            for (let rank = 0; rank < 8; rank++) {
                for (let file = 0; file < 8; file++) {
                    const piece = this.engine.board[rank][file];
                    if (piece && piece.color === 'black') {
                        const square = this.engine.squareToString(file, rank);
                        const moves = this.engine.getValidMoves(square);
                        moves.forEach(move => {
                            possibleMoves.push({
                                from: square,
                                to: move,
                                piece: piece.type,
                                notation: this.engine.generateMoveNotation(square, move, piece, this.engine.getPiece(move))
                            });
                        });
                    }
                }
            }

            console.log('Available moves for Black:', possibleMoves.map(m => `${m.notation} (${m.piece} ${m.from}-${m.to})`));

            // Find matching move with more sophisticated matching
            let matchingMove = this.findBestMoveMatch(moveNotation, possibleMoves);

            if (!matchingMove) {
                console.error(`No valid move found for "${moveNotation}".`);
                console.log('Available moves by type:');
                const movesByType = {};
                possibleMoves.forEach(move => {
                    if (!movesByType[move.piece]) movesByType[move.piece] = [];
                    movesByType[move.piece].push(move.notation);
                });
                console.log(movesByType);
                
                // Try to suggest a similar move
                const suggestion = this.suggestAlternativeMove(moveNotation, possibleMoves);
                if (suggestion) {
                    console.log(`Using alternative move: ${suggestion.notation} instead of ${moveNotation}`);
                    matchingMove = suggestion;
                } else {
                    throw new Error(`Could not find valid move for notation: ${moveNotation}`);
                }
            }

            console.log('Executing move:', matchingMove);
            
            // Execute the move
            return this.engine.makeMove(matchingMove.from, matchingMove.to);

        } catch (error) {
            console.error('Error parsing move:', error);
            throw error;
        }
    }

    suggestAlternativeMove(invalidMove, possibleMoves) {
        // Define central squares for development preference
        const centerSquares = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5', 'c6', 'f6', 'c3', 'f3'];

        // Try to find a reasonable alternative when the LLM suggests an invalid move
        
        // If it's trying to move a bishop in starting position, suggest a good opening move instead
        if (/^B[a-h][1-8]$/.test(invalidMove)) {
            console.log('LLM tried to move bishop - suggesting opening move instead');
            
            // Prefer good opening moves for Black
            const openingPreferences = ['e5', 'e6', 'd5', 'd6', 'Nf6', 'Nc6', 'c5', 'c6'];
            
            for (const pref of openingPreferences) {
                const match = possibleMoves.find(move => move.notation === pref);
                if (match) {
                    console.log(`Suggesting opening move: ${pref}`);
                    return match;
                }
            }
        }
        
        // If it's trying to capture something that doesn't exist, find a similar development move
        if (invalidMove.includes('x')) {
            const targetSquare = invalidMove.match(/x([a-h][1-8])/);
            if (targetSquare) {
                // Look for moves to nearby squares
                const target = targetSquare[1];
                const targetFile = target[0];
                const targetRank = parseInt(target[1]);
                
                // Find moves to adjacent squares
                for (const move of possibleMoves) {
                    const moveFile = move.to[0];
                    const moveRank = parseInt(move.to[1]);
                    
                    if (Math.abs(moveFile.charCodeAt(0) - targetFile.charCodeAt(0)) <= 1 &&
                        Math.abs(moveRank - targetRank) <= 1) {
                        return move;
                    }
                }
            }
        }
        
        // If it's a piece move to an invalid square, try to find the same piece moving elsewhere
        if (/^[KQRBN]/.test(invalidMove)) {
            const pieceType = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            }[invalidMove[0]];
            
            const samePieceMoves = possibleMoves.filter(move => move.piece === pieceType);
            if (samePieceMoves.length > 0) {
                const developmentMove = samePieceMoves.find(move => 
                    centerSquares.includes(move.to) || 
                    ['c6', 'f6', 'c3', 'f3'].includes(move.to)
                );
                
                return developmentMove || samePieceMoves[0];
            }
        }
        
        // If it's a pawn move, try to find a good pawn move
        if (/^[a-h][1-8]$/.test(invalidMove)) {
            const pawnMoves = possibleMoves.filter(move => move.piece === 'pawn');
            if (pawnMoves.length > 0) {
                // Prefer central pawn moves
                const centralPawnMoves = pawnMoves.filter(move => 
                    ['d5', 'e5', 'd6', 'e6', 'c5', 'f5'].includes(move.to)
                );
                return centralPawnMoves[0] || pawnMoves[0];
            }
        }
        
        // Last resort: suggest a good opening move
        console.log('No specific alternative found - suggesting best opening move');
        const goodOpeningMoves = ['e5', 'e6', 'Nf6', 'Nc6', 'd5', 'd6', 'c5'];
        
        for (const move of goodOpeningMoves) {
            const match = possibleMoves.find(m => m.notation === move);
            if (match) {
                console.log(`Fallback to opening move: ${move}`);
                return match;
            }
        }
        
        return null;
    }

    findBestMoveMatch(moveNotation, possibleMoves) {
        const cleaned = moveNotation.trim();
        
        // Remove any move numbers or dots at the beginning
        const cleanedMove = cleaned.replace(/^\d+\.\s*\.{3}\s*/, '').replace(/^\d+\.\s*/, '').trim();
        
        console.log(`Original: "${moveNotation}" -> Cleaned: "${cleanedMove}"`);
        
        // 1. Try exact notation match
        let match = possibleMoves.find(move => 
            move.notation.toLowerCase() === cleanedMove.toLowerCase()
        );
        if (match) return match;

        // 2. Handle promotion notation (d1=Q, d8=Q, etc.)
        if (/^[a-h][18]=[QRBN]$/.test(cleanedMove)) {
            const square = cleanedMove.substring(0, 2);
            match = possibleMoves.find(move => move.to === square && move.piece === 'pawn');
            if (match) return match;
        }

        // 3. For simple square moves like "e5", find pawn moves to that square
        if (/^[a-h][1-8]$/.test(cleanedMove)) {
            match = possibleMoves.find(move => 
                move.to === cleanedMove && move.piece === 'pawn'
            );
            if (match) return match;
            
            // Also try piece moves to that square
            match = possibleMoves.find(move => move.to === cleanedMove);
            if (match) return match;
        }

        // 4. For piece moves like "Nf6", match piece type and destination
        if (/^[KQRBN][a-h][1-8]$/.test(cleanedMove)) {
            const pieceMap = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            };
            const pieceType = pieceMap[cleanedMove[0]];
            const destination = cleanedMove.slice(1);
            
            match = possibleMoves.find(move => 
                move.piece === pieceType && move.to === destination
            );
            if (match) return match;
        }

        // 5. For captures like "exd5", match file and destination
        if (/^[a-h]x[a-h][1-8]$/.test(cleanedMove)) {
            const fromFile = cleanedMove[0];
            const destination = cleanedMove.slice(2);
            
            match = possibleMoves.find(move => 
                move.from[0] === fromFile && 
                move.to === destination && 
                move.notation.includes('x')
            );
            if (match) return match;
        }

        // 6. For piece captures like "Nxe4", match piece type and destination
        if (/^[KQRBN]x[a-h][1-8]$/.test(cleanedMove)) {
            const pieceMap = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            };
            const pieceType = pieceMap[cleanedMove[0]];
            const destination = cleanedMove.slice(2);
            
            match = possibleMoves.find(move => 
                move.piece === pieceType && 
                move.to === destination && 
                move.notation.includes('x')
            );
            if (match) return match;
        }

        // 7. Fuzzy matching - find moves that contain the destination square
        if (/[a-h][1-8]/.test(cleanedMove)) {
            const squareMatch = cleanedMove.match(/([a-h][1-8])/);
            if (squareMatch) {
                const square = squareMatch[1];
                match = possibleMoves.find(move => move.to === square);
                if (match) {
                    console.log(`Fuzzy match: "${cleanedMove}" -> ${match.notation}`);
                    return match;
                }
            }
        }

        return null;
    }

    async makeRandomMove() {
        // Fallback: make a random valid move
        const possibleMoves = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.engine.board[rank][file];
                if (piece && piece.color === 'black') {
                    const square = this.engine.squareToString(file, rank);
                    const moves = this.engine.getValidMoves(square);
                    moves.forEach(move => {
                        possibleMoves.push({ from: square, to: move });
                    });
                }
            }
        }

        if (possibleMoves.length > 0) {
            const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            const move = this.engine.makeMove(randomMove.from, randomMove.to);
            this.showError('LLM failed - made random move');
            return move;
        }
    }

    updateDisplay() {
        this.initializeBoard();
        this.updateBoardHighlights();
        this.updateStatus();
        this.updateControls();
    }

    updateStatus() {
        if (this.isWaitingForLLM) {
            return; // Don't override status when LLM is thinking
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
        undoBtn.disabled = this.engine.moveHistory.length === 0 || this.isWaitingForLLM;

        const hintBtn = document.getElementById('hint-btn');
        hintBtn.disabled = this.engine.currentPlayer !== 'white' || this.isWaitingForLLM || this.engine.gameState === 'checkmate';
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

        // Remove "no moves" message if present
        const noMoves = this.movesContainer.querySelector('.no-moves');
        if (noMoves) {
            noMoves.remove();
        }

        this.movesContainer.appendChild(moveEntry);
        this.movesContainer.scrollTop = this.movesContainer.scrollHeight;
    }

    showThinking(show) {
        this.thinkingIndicator.classList.toggle('active', show);
    }

    showError(message) {
        // Simple error display - you could enhance this with a toast or modal
        console.error(message);
        alert(message);
    }

    // ...existing code...

    updateThinkingDisplay(steps) {
        this.currentThinkingSteps = steps;
        
        if (!this.isThinkingVisible) return;

        // Find the current move's thinking section (after the last header)
        const headers = this.thinkingContent.querySelectorAll('.thinking-move-header');
        const lastHeader = headers[headers.length - 1];
        
        // Remove all thinking steps after the last header (current move's thinking)
        if (lastHeader) {
            let nextElement = lastHeader.nextElementSibling;
            while (nextElement) {
                const toRemove = nextElement;
                nextElement = nextElement.nextElementSibling;
                if (!toRemove.classList.contains('thinking-move-header') && 
                    !toRemove.classList.contains('thinking-stream-indicator') &&
                    !toRemove.classList.contains('thinking-retry-header')) {
                    toRemove.remove();
                }
            }
        }

        // Remove stream indicator if it exists
        const indicator = this.thinkingContent.querySelector('.thinking-stream-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Add current thinking steps
        steps.forEach((step, index) => {
            const stepElement = this.createThinkingStep(step, index);
            this.thinkingContent.appendChild(stepElement);
        });

        // Auto-scroll to bottom
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }
}

// Secure storage class for API keys
class SecureStorage {
    constructor() {
        this.storageKey = 'chess-llm-secure';
        this.encryptionKey = this.getOrCreateEncryptionKey();
    }

    getOrCreateEncryptionKey() {
        let key = localStorage.getItem('chess-llm-key');
        if (!key) {
            // Generate a simple key based on browser fingerprint
            key = this.generateBrowserKey();
            localStorage.setItem('chess-llm-key', key);
        }
        return key;
    }

    generateBrowserKey() {
        // Create a simple browser fingerprint for basic obfuscation
        const fingerprint = [
            navigator.userAgent.substring(0, 50), // Limit length to avoid encoding issues
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset().toString()
        ].join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
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
            
            // Use base64url encoding to avoid Latin1 issues
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
        // Convert to bytes and then to base64url
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
        // Add padding if needed
        str += '='.repeat((4 - str.length % 4) % 4);
        
        // Convert back from base64url to base64
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
            
            // Check if key is older than 30 days
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

    // Clean up old keys
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

