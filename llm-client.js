class LLMClient {
    constructor() {
        this.provider = 'lmstudio'; // 'lmstudio' or 'openai'
        this.endpoint = 'http://localhost:1234';
        this.model = 'google/gemma-3-4b';
        this.temperature = 0.3;
        this.isConnected = false;
        this.lastError = null;
        this.onThinkingUpdate = null;
        
        // OpenAI specific settings
        this.openaiApiKey = '';
        this.openaiModel = 'gpt-3.5-turbo';
        this.openaiEndpoint = 'https://api.openai.com/v1';
    }

    setProvider(provider) {
        this.provider = provider;
        this.isConnected = false;
    }

    setModel(model) {
        this.model = model;
    }

    setEndpoint(endpoint) {
        this.endpoint = endpoint;
    }

    setTemperature(temperature) {
        this.temperature = temperature;
    }

    setOpenAIApiKey(apiKey) {
        this.openaiApiKey = apiKey;
        this.isConnected = false;
    }

    setOpenAIModel(model) {
        this.openaiModel = model;
    }

    setThinkingCallback(callback) {
        this.onThinkingUpdate = callback;
    }

    getStatus() {
        return {
            provider: this.provider,
            connected: this.isConnected,
            lastError: this.lastError
        };
    }

    async testConnection() {
        try {
            if (this.provider === 'openai') {
                return await this.testOpenAIConnection();
            } else {
                return await this.testLMStudioConnection();
            }
        } catch (error) {
            this.isConnected = false;
            this.lastError = error.message;
            return { success: false, message: error.message };
        }
    }

    async testLMStudioConnection() {
        const response = await fetch(`${this.endpoint}/v1/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            this.isConnected = true;
            this.lastError = null;
            return { success: true, message: 'Connected to LM Studio' };
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    async testOpenAIConnection() {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key is required');
        }

        const response = await fetch(`${this.openaiEndpoint}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.openaiApiKey}`,
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            this.isConnected = true;
            this.lastError = null;
            return { success: true, message: 'Connected to OpenAI' };
        } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }
    }

    async getChessMove(gameState, moveHistory, previousAttempt = null) {
        try {
            const systemPrompt = this.buildSystemPrompt();
            const userPrompt = this.buildUserPrompt(gameState, moveHistory, previousAttempt);

            let response;
            if (this.provider === 'openai') {
                response = await this.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.getLMStudioResponse(systemPrompt, userPrompt);
            }
            
            if (this.onThinkingUpdate) {
                this.parseAndUpdateThinking(response);
            }
            
            return this.parseChessMove(response);
        } catch (error) {
            console.error('Error getting chess move from LLM:', error);
            throw error;
        }
    }

    async getOpenAIResponse(systemPrompt, userPrompt) {
        const response = await fetch(`${this.openaiEndpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openaiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.openaiModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: this.temperature,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async getLMStudioResponse(systemPrompt, userPrompt) {
        const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: this.temperature,
                max_tokens: 1000,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`LM Studio Error: HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    buildSystemPrompt() {
        return LLMPrompts.getMoveGenerationPrompt();
    }

    buildUserPrompt(gameState, moveHistory, previousAttempt = null) {
        const fen = gameState.getBoardAsFEN();
        
        // Get move history in readable format
        let moveHistoryText = '';
        if (moveHistory.length > 0) {
            const recentMoves = moveHistory.slice(-10);
            moveHistoryText = recentMoves.map((move, index) => {
                const fullIndex = moveHistory.length - recentMoves.length + index;
                const moveNumber = Math.floor(fullIndex / 2) + 1;
                const isWhiteMove = fullIndex % 2 === 0;
                
                if (isWhiteMove) {
                    return `${moveNumber}.${move.notation}`;
                } else {
                    return `${move.notation}`;
                }
            }).join(' ');
        }

        // Enhanced position analysis
        const positionAnalysis = this.getEnhancedPositionAnalysis(gameState, moveHistory);
        
        // Get legal moves for Black
        const legalMoves = this.getLegalMovesForColor(gameState, 'black');
        
        let prompt = `CURRENT POSITION (FEN): ${fen}

RECENT MOVES: ${moveHistoryText || 'Game start - Opening phase'}

${positionAnalysis}

YOUR LEGAL MOVES (${legalMoves.length} options): ${legalMoves.slice(0, 25).join(', ')}${legalMoves.length > 25 ? '...' : ''}

GAME PHASE: ${this.getGamePhase(moveHistory)}

CRITICAL ANALYSIS REQUIRED:
1. What did White just threaten with their last move?
2. Are any of your pieces under attack or hanging?
3. What tactical opportunities exist in this position?
4. What is your best plan for improvement?`;

        // Add specific opening guidance
        if (moveHistory.length < 20) {
            prompt += `\n\nOPENING PRIORITIES:
- Develop pieces toward center squares
- Control central squares (e5, d5, e6, d6)
- Castle early for king safety
- Don't move the same piece twice without reason
- Respond to opponent's central control`;
        }

        // Add error feedback if this is a retry
        if (previousAttempt) {
            prompt += `\n\n⚠️ PREVIOUS ATTEMPT FAILED:
You tried: "${previousAttempt.move}"
Error: ${previousAttempt.reason}

IMPORTANT: Choose a LEGAL move from your available options listed above.
Consider: ${this.suggestBetterMoves(previousAttempt, legalMoves)}`;
        }

        return prompt;
    }

    parseAndUpdateThinking(response) {
        if (!this.onThinkingUpdate) return;

        // Extract thinking steps from response
        const steps = [];
        const lines = response.split('\n');
        let currentStep = '';
        let stepType = 'analysis';

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.toLowerCase().includes('white just played') || 
                trimmed.toLowerCase().includes('let me check for threats')) {
                if (currentStep) {
                    steps.push({ type: stepType, content: currentStep.trim() });
                }
                currentStep = trimmed;
                stepType = 'analysis';
            } else if (trimmed.toLowerCase().includes('candidate moves') || 
                      trimmed.toLowerCase().includes('looking at')) {
                if (currentStep) {
                    steps.push({ type: stepType, content: currentStep.trim() });
                }
                currentStep = trimmed;
                stepType = 'evaluation';
            } else if (trimmed.toLowerCase().includes('my move:') || 
                      trimmed.toLowerCase().includes('i choose')) {
                if (currentStep) {
                    steps.push({ type: stepType, content: currentStep.trim() });
                }
                currentStep = trimmed;
                stepType = 'final';
            } else if (trimmed) {
                currentStep += '\n' + trimmed;
            }
        }

        // Add final step
        if (currentStep) {
            steps.push({ type: stepType, content: currentStep.trim() });
        }

        this.onThinkingUpdate(steps);
    }

    parseChessMove(response) {
        // Enhanced move parsing with multiple patterns
        const movePatterns = [
            /My move:\s*([a-h][1-8]|[NBRQK][a-h][1-8]|[NBRQK]x[a-h][1-8]|[a-h]x[a-h][1-8]|O-O-O|O-O)/i,
            /I (?:choose|play|move):\s*([a-h][1-8]|[NBRQK][a-h][1-8]|[NBRQK]x[a-h][1-8]|[a-h]x[a-h][1-8]|O-O-O|O-O)/i,
            /Move:\s*([a-h][1-8]|[NBRQK][a-h][1-8]|[NBRQK]x[a-h][1-8]|[a-h]x[a-h][1-8]|O-O-O|O-O)/i,
            /\b([a-h][1-8]|[NBRQK][a-h][1-8]|[NBRQK]x[a-h][1-8]|[a-h]x[a-h][1-8]|O-O-O|O-O)\b/g
        ];

        for (const pattern of movePatterns) {
            const match = response.match(pattern);
            if (match) {
                if (pattern.global) {
                    // For global patterns, take the last match (likely the final decision)
                    return match[match.length - 1];
                } else {
                    return match[1];
                }
            }
        }

        throw new Error('Could not parse move from LLM response');
    }

    getLegalMovesForColor(gameState, color) {
        const legalMoves = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.color === color) {
                    const square = gameState.squareToString(file, rank);
                    const moves = gameState.getValidMovesForSquare(square);
                    moves.forEach(move => {
                        const notation = gameState.generateMoveNotation(square, move, piece, gameState.getPiece(move));
                        legalMoves.push(notation);
                    });
                }
            }
        }
        
        return legalMoves.sort();
    }

    getEnhancedPositionAnalysis(gameState, moveHistory) {
        const threats = this.findImmediateThreats(gameState);
        const kingSafety = this.getKingSafetyAnalysis(gameState);
        const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
        
        let analysis = `POSITION ANALYSIS:
- Material: ${this.getMaterialSummary(gameState)}
- King Safety: ${kingSafety}`;

        if (lastMove) {
            analysis += `\n- White's Last Move: ${lastMove.notation} (${this.analyzeMoveIntent(lastMove, gameState)})`;
        }

        if (threats.length > 0) {
            analysis += `\n- ⚠️  IMMEDIATE THREATS: ${threats.join(', ')}`;
        }

        const pieceActivity = this.analyzePieceActivity(gameState);
        if (pieceActivity) {
            analysis += `\n- Piece Activity: ${pieceActivity}`;
        }

        return analysis;
    }

    getMaterialSummary(gameState) {
        const material = this.getMaterialCount(gameState);
        const whiteMaterial = material.white.total;
        const blackMaterial = material.black.total;
        
        if (whiteMaterial === blackMaterial) {
            return 'Equal material';
        } else if (blackMaterial > whiteMaterial) {
            return `Black ahead by ${blackMaterial - whiteMaterial} points`;
        } else {
            return `White ahead by ${whiteMaterial - blackMaterial} points`;
        }
    }

    getMaterialCount(gameState) {
        const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
        const material = {
            white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, total: 0 },
            black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, total: 0 }
        };
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.type !== 'king') {
                    material[piece.color][piece.type]++;
                    material[piece.color].total += pieceValues[piece.type];
                }
            }
        }
        
        return material;
    }

    findImmediateThreats(gameState) {
        const threats = [];
        
        // Check if Black king is in check
        if (gameState.isKingInCheck('black')) {
            threats.push('King in check!');
        }
        
        // Check for hanging pieces
        const hangingPieces = this.findHangingPieces(gameState, 'black');
        if (hangingPieces.length > 0) {
            threats.push(`Hanging pieces: ${hangingPieces.join(', ')}`);
        }
        
        return threats;
    }

    findHangingPieces(gameState, color) {
        const hanging = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.color === color) {
                    const square = gameState.squareToString(file, rank);
                    
                    const opponentColor = color === 'white' ? 'black' : 'white';
                    if (gameState.isSquareAttacked(square, opponentColor)) {
                        const defended = gameState.isSquareAttacked(square, color);
                        if (!defended || this.isNetLoss(piece, square, gameState)) {
                            hanging.push(`${piece.type}${square}`);
                        }
                    }
                }
            }
        }
        
        return hanging;
    }

    isNetLoss(piece, square, gameState) {
        const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
        const pieceValue = pieceValues[piece.type];
        
        const opponentColor = piece.color === 'white' ? 'black' : 'white';
        let lowestAttacker = 10;
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const attacker = gameState.board[rank][file];
                if (attacker && attacker.color === opponentColor) {
                    const attackerSquare = gameState.squareToString(file, rank);
                    const moves = gameState.generatePieceMoves(attackerSquare, attacker, false);
                    if (moves.includes(square)) {
                        const attackerValue = pieceValues[attacker.type];
                        lowestAttacker = Math.min(lowestAttacker, attackerValue);
                    }
                }
            }
        }
        
        return pieceValue > lowestAttacker;
    }

    getKingSafetyAnalysis(gameState) {
        const whiteInCheck = gameState.isKingInCheck('white');
        const blackInCheck = gameState.isKingInCheck('black');
        
        if (blackInCheck) return 'Black king in check - URGENT!';
        if (whiteInCheck) return 'White king in check - opportunity!';
        
        const blackKing = gameState.findKing('black');
        const whiteKing = gameState.findKing('white');
        
        let safety = '';
        
        if (blackKing === 'g8' || blackKing === 'c8') {
            safety += 'Black castled (safe)';
        } else if (blackKing === 'e8') {
            safety += 'Black king uncastled (risky)';
        } else {
            safety += 'Black king active';
        }
        
        if (whiteKing === 'g1' || whiteKing === 'c1') {
            safety += ', White castled';
        } else if (whiteKing === 'e1') {
            safety += ', White uncastled';
        } else {
            safety += ', White king active';
        }
        
        return safety;
    }

    analyzeMoveIntent(move, gameState) {
        const piece = move.piece;
        const to = move.to;
        
        if (move.captured) {
            return `Captured ${move.captured.type}`;
        }
        
        if (move.castling) {
            return 'Castled for king safety';
        }
        
        if (piece.type === 'pawn') {
            if (to.includes('4') || to.includes('5')) {
                return 'Central pawn advance';
            }
            return 'Pawn development';
        }
        
        if (['knight', 'bishop'].includes(piece.type)) {
            return 'Piece development';
        }
        
        if (piece.type === 'queen') {
            return 'Queen activity - check for threats';
        }
        
        return 'Positional improvement';
    }

    analyzePieceActivity(gameState) {
        const blackPieces = this.countActivePieces(gameState, 'black');
        const whitePieces = this.countActivePieces(gameState, 'white');
        
        if (blackPieces > whitePieces + 1) {
            return 'Black more active';
        } else if (whitePieces > blackPieces + 1) {
            return 'White more active - improve piece coordination';
        }
        
        return 'Balanced piece activity';
    }

    countActivePieces(gameState, color) {
        let activeCount = 0;
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.color === color && piece.type !== 'pawn' && piece.type !== 'king') {
                    const square = gameState.squareToString(file, rank);
                    const moves = gameState.getValidMovesForSquare(square);
                    if (moves.length > 2) {
                        activeCount++;
                    }
                }
            }
        }
        
        return activeCount;
    }

    getGamePhase(moveHistory) {
        const moveCount = moveHistory.length;
        
        if (moveCount < 16) {
            return 'Opening - Focus on development and king safety';
        } else if (moveCount < 40) {
            return 'Middlegame - Look for tactics and improve positions';
        } else {
            return 'Endgame - Activate king, push pawns, precise calculation';
        }
    }

    suggestBetterMoves(previousAttempt, legalMoves) {
        const suggestions = [];
        
        if (/^[KQRBN]/.test(previousAttempt.move)) {
            const pieceType = previousAttempt.move[0];
            const samePiece = legalMoves.filter(move => move.startsWith(pieceType));
            if (samePiece.length > 0) {
                suggestions.push(`Legal ${pieceType} moves: ${samePiece.slice(0, 3).join(', ')}`);
            }
        }
        
        const developingMoves = legalMoves.filter(move => 
            ['Nf6', 'Nc6', 'e6', 'e5', 'd6', 'd5', 'Be7', 'Bd7', 'O-O'].includes(move)
        );
        
        if (developingMoves.length > 0) {
            suggestions.push(`Good developing moves: ${developingMoves.join(', ')}`);
        }
        
        return suggestions.join(' | ') || 'Try any of the legal moves listed above';
    }

    async getHint(gameState, moveHistory, playerColor) {
        const systemPrompt = LLMPrompts.getHintPrompt(playerColor);
        const userPrompt = this.buildUserPrompt(gameState, moveHistory);

        try {
            let response;
            if (this.provider === 'openai') {
                response = await this.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.getLMStudioResponse(systemPrompt, userPrompt);
            }
            
            return response;
        } catch (error) {
            throw new Error('Could not get hint: ' + error.message);
        }
    }

    // Add method for getting random move (used in recovery)
    getRandomMove(gameState) {
        const legalMoves = this.getLegalMovesForColor(gameState, 'black');
        if (legalMoves.length === 0) return null;
        
        // Prefer developing moves in opening
        if (gameState.moveHistory.length < 16) {
            const developingMoves = legalMoves.filter(move => 
                ['Nf6', 'Nc6', 'e5', 'd5', 'e6', 'd6', 'Be7', 'Bd7'].includes(move)
            );
            if (developingMoves.length > 0) {
                return developingMoves[Math.floor(Math.random() * developingMoves.length)];
            }
        }
        
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
}