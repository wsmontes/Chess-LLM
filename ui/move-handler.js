class MoveHandler {
    constructor(engine, llm, boardManager) {
        this.engine = engine;
        this.llm = llm;
        this.boardManager = boardManager;
        this.isWaitingForLLM = false;
    }

    async makeMove(fromSquare, toSquare) {
        try {
            // Validate move using engine's validation
            const validMoves = this.engine.getValidMoves(fromSquare);
            if (!validMoves.includes(toSquare)) {
                throw new Error('Invalid move');
            }

            // Make the move
            const move = this.engine.makeMove(fromSquare, toSquare);
            this.boardManager.clearSelection();
            
            return move;
        } catch (error) {
            console.error('Error making move:', error);
            this.boardManager.clearSelection();
            throw error;
        }
    }

    findBestMoveMatch(moveNotation, possibleMoves) {
        const cleaned = moveNotation.trim();
        const cleanedMove = cleaned.replace(/^\d+\.\s*\.{3}\s*/, '').replace(/^\d+\.\s*/, '').replace(/^1\.\.\.\s*/, '').trim();
        
        console.log(`Finding move match for: "${cleanedMove}"`);
        console.log("Available moves:", possibleMoves.map(m => m.notation).join(', '));
        
        // Try exact notation match
        let match = possibleMoves.find(move => 
            move.notation.toLowerCase() === cleanedMove.toLowerCase()
        );
        if (match) {
            console.log(`Found exact match: ${match.notation}`);
            return match;
        }

        // Try various pattern matches
        // For piece moves like "Ne3", "Be6", etc.
        if (/^[KQRBN][a-h][1-8]$/.test(cleanedMove)) {
            const pieceMap = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            };
            
            const pieceType = pieceMap[cleanedMove[0]];
            const destination = cleanedMove.slice(1);
            
            console.log(`Looking for ${pieceType} move to ${destination}`);
            
            // Try piece type and destination exact match
            match = possibleMoves.find(move => 
                move.piece === pieceType && move.to === destination
            );
            
            if (match) {
                console.log(`Found ${pieceType} move to ${destination}: ${match.notation}`);
                return match;
            }
            
            // If not found, search by destination
            const movesToDestination = possibleMoves.filter(move => move.to === destination);
            if (movesToDestination.length > 0) {
                console.log(`Found move to ${destination}: ${movesToDestination[0].notation}`);
                return movesToDestination[0]; // Take first available move to that square
            }
        }

        // For piece captures like "Nxe3"
        if (/^[KQRBN]x[a-h][1-8]$/.test(cleanedMove)) {
            const pieceMap = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            };
            
            const pieceType = pieceMap[cleanedMove[0]];
            const destination = cleanedMove.slice(2); // Get destination after the 'x'
            
            console.log(`Looking for ${pieceType} capture to ${destination}`);
            
            // Find exact piece type and destination with capture
            match = possibleMoves.find(move => 
                move.piece === pieceType && 
                move.to === destination && 
                move.notation.includes('x')
            );
            
            if (match) {
                console.log(`Found ${pieceType} capture to ${destination}`);
                return match;
            }
            
            // Any piece capturing to that destination
            match = possibleMoves.find(move => 
                move.to === destination && 
                move.notation.includes('x')
            );
            
            if (match) {
                console.log(`Found capture to ${destination} with ${match.piece}`);
                return match;
            }
            
            // Any move to that destination as fallback
            match = possibleMoves.find(move => move.to === destination);
            if (match) {
                console.log(`Found move to ${destination} as fallback`);
                return match;
            }
        }

        // For pawn moves like "e4"
        if (/^[a-h][1-8]$/.test(cleanedMove)) {
            // Look for pawn move to that square
            match = possibleMoves.find(move => 
                move.to === cleanedMove && move.piece === 'pawn'
            );
            
            if (match) {
                console.log(`Found pawn move to ${cleanedMove}`);
                return match;
            }
            
            // Any move to that square as fallback
            match = possibleMoves.find(move => move.to === cleanedMove);
            if (match) {
                console.log(`Found any move to ${cleanedMove}`);
                return match;
            }
        }
        
        console.log("No match found, checking for any move with similar destination");
        
        // IMPROVED: Last resort - look for any move involving a key square in the notation
        const squareMatches = cleanedMove.match(/[a-h][1-8]/g);
        if (squareMatches && squareMatches.length > 0) {
            for (const square of squareMatches) {
                // Try moves to that square
                match = possibleMoves.find(move => move.to === square);
                if (match) {
                    console.log(`Emergency fallback: Found move to ${square}`);
                    return match;
                }
                
                // Try moves from that square
                match = possibleMoves.find(move => move.from === square);
                if (match) {
                    console.log(`Emergency fallback: Found move from ${square}`);
                    return match;
                }
            }
        }

        // ABSOLUTE LAST RESORT: Just return the first available move
        if (possibleMoves.length > 0) {
            console.log(`No match found at all - using first available move: ${possibleMoves[0].notation}`);
            return possibleMoves[0];
        }

        console.log("NO VALID MOVES FOUND!");
        return null;
    }

    async getLLMMove(previousAttempt = null, attemptCount = 0) {
        if (this.isWaitingForLLM) return;
        
        // Check if game is already over before attempting to get a move
        if (this.engine.isGameOver && this.engine.isGameOver()) {
            console.log('Game is already over, not requesting LLM move');
            return null;
        }
        
        const maxAttempts = 3;
        const moveTimeout = 35000; // 35 seconds
        this.isWaitingForLLM = true;
        
        // Add timeout protection to prevent infinite waits
        let moveTimeoutId = setTimeout(() => {
            console.warn('⚠️ LLM move timed out - forcing recovery');
            this.isWaitingForLLM = false;
            this.handleGameOverState();
        }, moveTimeout);

        try {
            // Test connection
            const connectionTest = await this.llm.testConnection();
            if (!connectionTest.success) {
                throw new Error('Not connected to LLM provider: ' + connectionTest.message);
            }

            // Get move from LLM
            const attemptData = previousAttempt ? {
                ...previousAttempt,
                attemptNumber: attemptCount + 1
            } : null;
            
            // Get move with a timeout to prevent hanging
            let moveNotation;
            try {
                moveNotation = await Promise.race([
                    this.llm.getChessMove(this.engine, this.engine.moveHistory, attemptData),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('LLM response timeout')), 30000)
                    )
                ]);
            } catch (timeoutError) {
                console.warn('LLM move response timed out:', timeoutError);
                throw new Error('LLM thinking took too long - try again or use recovery');
            }
            
            // Validate the move
            const validationResult = this.validateLLMMove(moveNotation);
            
            if (!validationResult.isValid) {
                if (attemptCount < maxAttempts - 1) {
                    const newAttempt = {
                        move: moveNotation,
                        reason: validationResult.reason,
                        availableMoves: validationResult.availableMoves,
                        piecePositions: validationResult.piecePositions,
                        currentPosition: validationResult.currentPosition,
                        attemptNumber: attemptCount + 1
                    };
                    
                    clearTimeout(moveTimeoutId);
                    this.isWaitingForLLM = false;
                    
                    console.log(`Trying again (attempt ${attemptCount + 2}/${maxAttempts})...`);
                    setTimeout(() => {
                        this.getLLMMove(newAttempt, attemptCount + 1);
                    }, 1000);
                    return;
                } else {
                    console.warn('Maximum retry attempts reached, checking if game is over');
                    // Check if we're in a game over state instead of trying random move
                    if (this.isGameOverState()) {
                        console.log('Game is over - no more moves needed');
                        clearTimeout(moveTimeoutId);
                        this.isWaitingForLLM = false;
                        return null;
                    }
                    throw new Error(`Couldn't get valid move after ${maxAttempts} attempts - checking game state`);
                }
            }
            
            clearTimeout(moveTimeoutId);
            
            // Make the move - with safeguards
            try {
                const move = await this.parseAndExecuteMove(moveNotation);
                this.isWaitingForLLM = false;
                return move;
            } catch (moveError) {
                console.error("Error executing parsed move:", moveError);
                throw new Error("Failed to execute move: " + moveError.message);
            }

        } catch (error) {
            console.error('Error in LLM move process:', error);
            clearTimeout(moveTimeoutId);
            
            // Check if game is over before attempting fallback
            if (this.isGameOverState()) {
                console.log('Game is over - no fallback move needed');
                this.isWaitingForLLM = false;
                return null;
            }
            
            // Only attempt random move if game is not over
            return await this.handleGameOverState();
        } finally {
            // Always make sure we reset the waiting state
            this.isWaitingForLLM = false;
        }
    }

    validateLLMMove(moveNotation) {
        // ...existing validation logic...
        try {
            const possibleMoves = [];
            const piecePositions = new Map();
            
            for (let rank = 0; rank < 8; rank++) {
                for (let file = 0; file < 8; file++) {
                    const piece = this.engine.board[rank][file];
                    if (piece && piece.color === 'black') {
                        const square = this.engine.squareToString(file, rank);
                        const moves = this.engine.getValidMoves(square);
                        
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

            const matchingMove = this.findBestMoveMatch(moveNotation, possibleMoves);
            
            if (!matchingMove) {
                const availableMoves = possibleMoves.map(m => m.notation);
                const reason = this.generateDetailedMoveError(moveNotation, possibleMoves, piecePositions);
                
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
        
        const cleanMove = moveNotation.trim();
        
        // Check for specific error patterns
        if (/^[KQRBN][a-h][1-8]$/.test(cleanMove)) {
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
        }
        
        // Add more patterns as needed...
        const topMoves = possibleMoves.slice(0, 5).map(m => m.notation);
        reason += `RECOMMENDED MOVES (choose one): ${topMoves.join(', ')}`;
        
        return reason;
    }

    parseAndExecuteMove(moveNotation) {
        // ...existing parsing logic...
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

        let matchingMove = this.findBestMoveMatch(moveNotation, possibleMoves);

        if (!matchingMove) {
            const suggestion = this.suggestAlternativeMove(moveNotation, possibleMoves);
            if (suggestion) {
                matchingMove = suggestion;
            } else {
                throw new Error(`Could not find valid move for notation: ${moveNotation}`);
            }
        }
        
        return this.engine.makeMove(matchingMove.from, matchingMove.to);
    }

    suggestAlternativeMove(invalidMove, possibleMoves) {
        const centerSquares = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5', 'c6', 'f6', 'c3', 'f3'];

        // Bishop starting position fallback
        if (/^B[a-h][1-8]$/.test(invalidMove)) {
            const openingPreferences = ['e5', 'e6', 'd5', 'd6', 'Nf6', 'Nc6', 'c5', 'c6'];
            
            for (const pref of openingPreferences) {
                const match = possibleMoves.find(move => move.notation === pref);
                if (match) return match;
            }
        }
        
        // Piece moves
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
        
        // Pawn moves
        if (/^[a-h][1-8]$/.test(invalidMove)) {
            const pawnMoves = possibleMoves.filter(move => move.piece === 'pawn');
            if (pawnMoves.length > 0) {
                const centralPawnMoves = pawnMoves.filter(move => 
                    ['d5', 'e5', 'd6', 'e6', 'c5', 'f5'].includes(move.to)
                );
                return centralPawnMoves[0] || pawnMoves[0];
            }
        }
        
        // Last resort: good opening moves
        const goodOpeningMoves = ['e5', 'e6', 'Nf6', 'Nc6', 'd5', 'd6', 'c5'];
        
        for (const move of goodOpeningMoves) {
            const match = possibleMoves.find(m => m.notation === move);
            if (match) return match;
        }
        
        return null;
    }

    // Add a more robust random move method
    async makeRandomMove() {
        console.log('🎲 Making random move as fallback');
        
        // First check if we're in a game over state
        if (this.isGameOverState()) {
            console.log('Game is over - cannot make random move');
            return null;
        }
        
        try {
            const possibleMoves = [];
            
            // Gather all legal moves for current player
            for (let rank = 0; rank < 8; rank++) {
                for (let file = 0; file < 8; file++) {
                    const piece = this.engine.board[rank][file];
                    if (piece && piece.color === this.engine.currentPlayer) {
                        const square = this.engine.squareToString(file, rank);
                        const moves = this.engine.getValidMoves(square);
                        moves.forEach(move => {
                            possibleMoves.push({ from: square, to: move });
                        });
                    }
                }
            }
            
            if (possibleMoves.length === 0) {
                console.log('No valid moves available - game should be over');
                this.isGameOverState(); // This will set the proper game state
                return null;
            }
            
            // Choose a move that develops a piece if possible
            const developingMoves = possibleMoves.filter(move => {
                const piece = this.engine.getPiece(move.from);
                return piece.type !== 'pawn' && ['c6', 'd5', 'e5', 'f6', 'e6'].includes(move.to);
            });
            
            const moveToUse = developingMoves.length > 0 ? 
                developingMoves[Math.floor(Math.random() * developingMoves.length)] :
                possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            
            console.log('Random move chosen:', moveToUse);
            return this.engine.makeMove(moveToUse.from, moveToUse.to);
        } catch (error) {
            console.error('Failed to make random move:', error);
            // Check if this is because game is over
            if (this.isGameOverState()) {
                return null;
            }
            throw error;
        }
    }

    // Add helper method to check if game is in an over state
    isGameOverState() {
        // Check if current player has no valid moves
        const hasValidMoves = this.hasValidMovesForCurrentPlayer();
        
        if (!hasValidMoves) {
            // Update game state based on whether king is in check
            const inCheck = this.engine.isKingInCheck(this.engine.currentPlayer);
            
            if (inCheck) {
                this.engine.gameState = 'checkmate';
                console.log(`${this.engine.currentPlayer} is in checkmate`);
            } else {
                this.engine.gameState = 'stalemate';
                console.log(`${this.engine.currentPlayer} is in stalemate`);
            }
            
            return true;
        }
        
        return false;
    }

    // Add helper method to check if current player has valid moves
    hasValidMovesForCurrentPlayer() {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.engine.board[rank][file];
                if (piece && piece.color === this.engine.currentPlayer) {
                    const square = this.engine.squareToString(file, rank);
                    const validMoves = this.engine.getValidMoves(square);
                    if (validMoves.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Add method to handle game over state properly
    async handleGameOverState() {
        this.isWaitingForLLM = false;
        
        // Update the game state one more time to be sure
        this.engine.updateGameEndingConditions();
        
        console.log('Handling game over state:', this.engine.gameState);
        return null; // No move to return since game is over
    }
}
