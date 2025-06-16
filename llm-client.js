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

    setOpenAIApiKey(apiKey) {
        this.openaiApiKey = apiKey;
        this.isConnected = false;
    }

    setOpenAIModel(model) {
        this.openaiModel = model;
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

            if (this.provider === 'openai') {
                return await this.getChessMoveOpenAI(systemPrompt, userPrompt);
            } else {
                // Use streaming for LM Studio if thinking callback is available
                if (this.onThinkingUpdate) {
                    return await this.getChessMoveWithStreaming(systemPrompt, userPrompt);
                } else {
                    return await this.getChessMoveNormal(systemPrompt, userPrompt);
                }
            }
        } catch (error) {
            console.error('Error getting chess move from LLM:', error);
            throw error;
        }
    }

    async getChessMoveOpenAI(systemPrompt, userPrompt) {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key is required');
        }

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
                max_tokens: 300,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const moveText = data.choices[0].message.content.trim();
        
        // For OpenAI, simulate thinking display if callback is available
        if (this.onThinkingUpdate) {
            this.parseAndUpdateThinking(moveText);
        }
        
        return this.parseChessMove(moveText);
    }

    async getChessMoveWithStreaming(systemPrompt, userPrompt) {
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
                max_tokens: 300,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let lastUpdateLength = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            
                            if (content) {
                                fullResponse += content;
                                
                                // Only update thinking display periodically to avoid spam
                                if (fullResponse.length - lastUpdateLength > 20 || 
                                    content.includes('\n') || 
                                    /[.!?]/.test(content)) {
                                    
                                    if (this.onThinkingUpdate) {
                                        this.parseAndUpdateThinking(fullResponse);
                                    }
                                    lastUpdateLength = fullResponse.length;
                                }
                            }
                        } catch (e) {
                            // Skip invalid JSON chunks
                            continue;
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Final update with complete response
        if (this.onThinkingUpdate && fullResponse.length > lastUpdateLength) {
            this.parseAndUpdateThinking(fullResponse);
        }

        return this.parseChessMove(fullResponse);
    }

    async getChessMoveNormal(systemPrompt, userPrompt) {
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
                max_tokens: 300,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const moveText = data.choices[0].message.content.trim();
        
        return this.parseChessMove(moveText);
    }

    parseAndUpdateThinking(text) {
        // Parse the LLM's thinking process and categorize it
        const steps = this.categorizeThinking(text);
        
        if (this.onThinkingUpdate) {
            this.onThinkingUpdate(steps);
        }
    }

    categorizeThinking(text) {
        const steps = [];
    
        // Split text into meaningful sections instead of creating steps for every character
        const sections = this.parseThinkingSections(text);
    
        for (const section of sections) {
            if (section.content.trim().length > 0) {
                steps.push({
                    type: section.type,
                    content: section.content.trim()
                });
            }
        }

        return steps;
    }

    parseThinkingSections(text) {
        const sections = [];
        let currentType = 'analysis';
        let currentContent = '';
    
        // Split by lines and process
        const lines = text.split('\n');
    
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            // Detect section changes based on content
            let newType = this.detectThinkingType(trimmed);
            
            // If type changed and we have content, save current section
            if (newType !== currentType && currentContent.trim()) {
                sections.push({
                    type: currentType,
                    content: currentContent.trim()
                });
                currentContent = '';
            }
            
            currentType = newType;
            currentContent += (currentContent ? ' ' : '') + trimmed;
        }
        
        // Add final section if there's content
        if (currentContent.trim()) {
            sections.push({
                type: currentType,
                content: currentContent.trim()
            });
        }
        
        return sections;
    }

    detectThinkingType(text) {
        const lower = text.toLowerCase();
        
        // Check for final move pattern first
        if (/^[a-h][1-8]$|^[KQRBN][a-h][1-8]$|^O-O/.test(text.trim())) {
            return 'final';
        }
        
        // Check for decision indicators
        if (lower.includes('best') || lower.includes('choose') || 
            lower.includes('decision') || lower.includes('will play') ||
            lower.includes('selected move')) {
            return 'decision';
        }
        
        // Check for evaluation indicators
        if (lower.includes('considering') || lower.includes('option') ||
            lower.includes('move evaluation') || lower.includes('candidate') ||
            lower.includes('possible')) {
            return 'evaluation';
        }
        
        // Default to analysis
        return 'analysis';
    }

    buildSystemPrompt() {
        return `You are a chess grandmaster playing as BLACK pieces. You must analyze the CURRENT position carefully and respond with a valid chess move.

CRITICAL INSTRUCTIONS:
1. Study the FEN notation provided to understand the EXACT current position
2. Consider ONLY the pieces that are currently on the board
3. Remember that bishops and rooks cannot move if blocked by pawns or other pieces
4. Knights can jump over pieces, but other pieces cannot
5. Only suggest moves that are actually legal from the CURRENT position
6. ALWAYS end your response with your chosen move on its own line
7. The move must be in standard algebraic notation and must be legal

ANALYSIS PROCESS:
1. Look at the FEN to see where all pieces actually are
2. Consider what moves are actually possible for YOUR pieces (not blocked by other pieces)
3. Do NOT capture pieces that aren't there
4. Do NOT move pieces that are blocked by pawns or other pieces
5. Remember: bishops on c8/f8 cannot move in starting position due to pawn blockades

You are playing BLACK pieces. Your move must be valid for Black in the CURRENT position.

COMMON OPENING MOVES FOR BLACK:
- Pawn moves: e5, e6, d5, d6, c5, c6 (if pawns can actually move there)
- Knight moves: Nf6, Nc6, Ne7, Nh6 (if knights can actually move there)
- DO NOT suggest bishop moves in starting position - they are blocked by pawns

IMPORTANT REMINDERS:
- In starting position, bishops CANNOT move (blocked by pawns)
- In starting position, rooks CANNOT move (blocked by pawns)
- Only knights and pawns can move from starting position
- Check the FEN carefully - pieces may not be in starting positions

RESPONSE STRUCTURE:
[Brief analysis of CURRENT position based on FEN]
[Consider ONLY legal moves available NOW]
[YOUR MOVE HERE - just the move notation on its own line]

Remember: You MUST end with a valid move for Black pieces from the CURRENT position shown in the FEN!`;
    }

    buildUserPrompt(gameState, moveHistory, previousAttempt = null) {
        const fen = gameState.getBoardAsFEN();
        
        // Build detailed move history - show more moves for better context
        let moveHistoryText = '';
        if (moveHistory.length > 0) {
            // Show all moves instead of just last 8 for better context
            moveHistoryText = moveHistory.map((move, index) => {
                const moveNumber = Math.floor(index / 2) + 1;
                const isWhiteMove = index % 2 === 0;
                
                if (isWhiteMove) {
                    return `${moveNumber}. ${move.notation}`;
                } else {
                    return `${move.notation}`;
                }
            }).join(' ');
        }

        // Also provide a more readable format
        let moveSequence = '';
        if (moveHistory.length > 0) {
            moveSequence = '\nMOVE SEQUENCE:\n';
            for (let i = 0; i < moveHistory.length; i += 2) {
                const moveNumber = Math.floor(i / 2) + 1;
                const whiteMove = moveHistory[i]?.notation || '';
                const blackMove = moveHistory[i + 1]?.notation || '';
                
                if (blackMove) {
                    moveSequence += `${moveNumber}. ${whiteMove} ${blackMove}\n`;
                } else if (whiteMove) {
                    moveSequence += `${moveNumber}. ${whiteMove}\n`;
                }
            }
        }

        // Get all legal moves for Black
        const legalMoves = this.getLegalMovesForColor(gameState, 'black');
        
        // Describe what pieces are actually on the board for Black
        let blackPieceDescription = '';
        const board = gameState.board;
        const blackPieces = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (piece && piece.color === 'black') {
                    const square = gameState.squareToString(file, rank);
                    const pieceType = piece.type === 'knight' ? 'N' : 
                                    piece.type === 'bishop' ? 'B' :
                                    piece.type === 'rook' ? 'R' :
                                    piece.type === 'queen' ? 'Q' :
                                    piece.type === 'king' ? 'K' : '';
                    
                    if (piece.type !== 'pawn') {
                        blackPieces.push(`${pieceType}${square}`);
                    }
                }
            }
        }
        blackPieceDescription = blackPieces.join(', ') || 'Only pawns in starting positions';

        // Also describe what White pieces are visible for context
        let whitePieceDescription = '';
        const whitePieces = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (piece && piece.color === 'white') {
                    const square = gameState.squareToString(file, rank);
                    const pieceType = piece.type === 'knight' ? 'N' : 
                                    piece.type === 'bishop' ? 'B' :
                                    piece.type === 'rook' ? 'R' :
                                    piece.type === 'queen' ? 'Q' :
                                    piece.type === 'king' ? 'K' : '';
                    
                    if (piece.type !== 'pawn') {
                        whitePieces.push(`${pieceType}${square}`);
                    }
                }
            }
        }
        whitePieceDescription = whitePieces.join(', ') || 'Only pawns in starting positions';

        let prompt = `CURRENT POSITION (FEN): ${fen}

MOVE HISTORY (PGN format): ${moveHistoryText || 'Game just started'}${moveSequence}

CURRENT MOVE NUMBER: ${Math.ceil((moveHistory.length + 1) / 2)} (${moveHistory.length % 2 === 0 ? 'Black to move' : 'Black responding to White'})

YOUR BLACK PIECES CURRENTLY ON BOARD: ${blackPieceDescription}
WHITE PIECES CURRENTLY ON BOARD: ${whitePieceDescription}

LEGAL MOVES AVAILABLE TO YOU RIGHT NOW: ${legalMoves.join(', ')}

IMPORTANT: Analyze the FEN notation above to see the EXACT current position. Do not assume where pieces should be - look at where they actually are.`;

        // Enhanced feedback from previous invalid attempt
        if (previousAttempt) {
            prompt += `

⚠️ MOVE CORRECTION REQUIRED - ATTEMPT ${previousAttempt.attemptNumber || 1}

INVALID MOVE: "${previousAttempt.move}"

DETAILED ANALYSIS OF WHY THIS MOVE FAILED:
${previousAttempt.reason}

POSITION CONTEXT:
- Current FEN: ${previousAttempt.currentPosition || fen}
- Available legal moves: ${(previousAttempt.availableMoves || legalMoves).slice(0, 10).join(', ')}${(previousAttempt.availableMoves || legalMoves).length > 10 ? '...' : ''}

PIECE POSITIONS:
${previousAttempt.piecePositions ? Object.entries(previousAttempt.piecePositions).map(([type, positions]) => `- ${type}: ${positions.join(', ')}`).join('\n') : 'See above'}

CRITICAL INSTRUCTIONS FOR RETRY:
1. READ the detailed error analysis above carefully
2. CHOOSE from the available legal moves list ONLY
3. DO NOT repeat the same invalid move
4. CONSIDER the recommended moves from the analysis
5. VERIFY your chosen move appears in the legal moves list

Please analyze the error, understand why your previous move was invalid, and choose a different LEGAL move from the available options.`;
        }

        prompt += `

It's your turn to move as BLACK. Choose a legal move from the current position.`;

        return prompt;
    }

    getLegalMovesForColor(gameState, color) {
        const legalMoves = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.color === color) {
                    const square = gameState.squareToString(file, rank);
                    const moves = gameState.getValidMoves(square);
                    moves.forEach(move => {
                        const notation = gameState.generateMoveNotation(square, move, piece, gameState.getPiece(move));
                        legalMoves.push(notation);
                    });
                }
            }
        }
        
        return legalMoves.sort(); // Sort for better readability
    }

    async getHint(gameState, moveHistory, playerColor) {
        try {
            const systemPrompt = `You are a chess coach providing helpful hints to a ${playerColor} player. 
Analyze the position and suggest a good move with a brief explanation (1-2 sentences).
Format: "Move: [move] - [brief explanation]"`;

            const userPrompt = this.buildUserPrompt(gameState, moveHistory);

            if (this.provider === 'openai') {
                if (!this.openaiApiKey) {
                    throw new Error('OpenAI API key is required');
                }

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
                        temperature: 0.5,
                        max_tokens: 100,
                        stream: false
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content.trim();
            } else {
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
                        temperature: 0.5,
                        max_tokens: 100,
                        stream: false
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content.trim();
            }
        } catch (error) {
            console.error('Error getting hint from LLM:', error);
            throw error;
        }
    }

    setEndpoint(endpoint) {
        this.endpoint = endpoint;
        this.isConnected = false;
    }

    setModel(model) {
        this.model = model;
    }

    setTemperature(temperature) {
        this.temperature = Math.max(0, Math.min(1, temperature));
    }

    getStatus() {
        return {
            connected: this.isConnected,
            provider: this.provider,
            endpoint: this.provider === 'openai' ? this.openaiEndpoint : this.endpoint,
            model: this.provider === 'openai' ? this.openaiModel : this.model,
            temperature: this.temperature,
            lastError: this.lastError,
            hasApiKey: this.provider === 'openai' ? !!this.openaiApiKey : true
        };
    }

    setThinkingCallback(callback) {
        this.onThinkingUpdate = callback;
    }

    async analyzeCheckPosition(gameState, moveHistory, playerInCheck) {
        try {
            const systemPrompt = `You are a chess grandmaster analyzing a position where ${playerInCheck} is in check.

Your task is to determine if this is CHECKMATE or just CHECK.

CHECKMATE occurs when ALL THREE conditions are met:
1. The king is in check
2. The king CANNOT move to any safe square
3. NO piece can block the check OR capture the attacking piece

CHECK occurs when:
1. The king is in check 
2. BUT there is at least ONE legal move that gets the king out of check

To escape check, you can:
1. MOVE THE KING to a safe square (not attacked by opponent pieces)
2. BLOCK the check by moving a piece between the king and attacker
3. CAPTURE the piece that is giving check

CRITICAL: Even if the king cannot move, it's NOT checkmate if ANY other piece can block or capture to save the king.

You must check EVERY possible move for the player in check. If even ONE move exists that gets out of check, it's CHECK, not CHECKMATE.

Analyze thoroughly and respond with either:
- "CHECKMATE" only if there are absolutely zero legal moves
- "CHECK" if there are any legal moves available

End your response with just the word CHECKMATE or CHECK on its own line.`;

            const userPrompt = this.buildCheckAnalysisPrompt(gameState, moveHistory, playerInCheck);

            let response;
            if (this.provider === 'openai') {
                response = await this.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.getLMStudioResponse(systemPrompt, userPrompt);
            }

            // Parse the response
            const lines = response.split('\n').map(line => line.trim()).filter(line => line);
            const lastLine = lines[lines.length - 1].toUpperCase();
            
            console.log('LLM checkmate analysis response:', response);
            console.log('Final decision:', lastLine);
            
            if (lastLine === 'CHECKMATE') {
                // Double-check with engine logic as a safety net
                const engineCheckmate = gameState.isActualCheckmate(playerInCheck);
                console.log('Engine checkmate verification:', engineCheckmate);
                
                if (!engineCheckmate) {
                    console.warn('LLM said checkmate but engine says no - defaulting to check');
                    return 'check';
                }
                return 'checkmate';
            } else if (lastLine === 'CHECK') {
                return 'check';
            } else {
                // Fallback: if response is unclear, assume it's just check
                console.warn('LLM analysis unclear, defaulting to check:', response);
                return 'check';
            }

        } catch (error) {
            console.error('Error analyzing check position:', error);
            // Fallback: assume it's just check if analysis fails
            return 'check';
        }
    }

    buildCheckAnalysisPrompt(gameState, moveHistory, playerInCheck) {
        const fen = gameState.getBoardAsFEN();
        const opponentColor = playerInCheck === 'white' ? 'black' : 'white';
        
        // Get all legal moves for the player in check
        const legalMoves = this.getLegalMovesForColor(gameState, playerInCheck);
        
        // Get king position and what's attacking it
        const kingSquare = gameState.findKing(playerInCheck);
        const attackingPieces = this.findAttackingPieces(gameState, kingSquare, opponentColor);
        
        let moveHistoryText = '';
        if (moveHistory.length > 0) {
            const recentMoves = moveHistory.slice(-6);
            moveHistoryText = recentMoves.map((move, index) => {
                const fullMoveIndex = moveHistory.length - recentMoves.length + index;
                const moveNumber = Math.floor(fullMoveIndex / 2) + 1;
                const isWhiteMove = fullMoveIndex % 2 === 0;
                
                if (isWhiteMove) {
                    return `${moveNumber}. ${move.notation}`;
                } else {
                    return `${move.notation}`;
                }
            }).join(' ');
        }

        return `POSITION TO ANALYZE (FEN): ${fen}

RECENT MOVES: ${moveHistoryText || 'Game start'}

CURRENT SITUATION:
- ${playerInCheck.toUpperCase()} KING on ${kingSquare} is in CHECK
- Attacking pieces: ${attackingPieces.join(', ')}
- ${playerInCheck.toUpperCase()} has ${legalMoves.length} legal moves available

ALL LEGAL MOVES FOR ${playerInCheck.toUpperCase()}: ${legalMoves.length > 0 ? legalMoves.join(', ') : 'NONE'}

ANALYSIS REQUIRED:
1. Can the KING move to any safe square? Check each king move carefully.
2. Can ANY piece CAPTURE the attacking piece(s)?
3. Can ANY piece BLOCK the check by moving between king and attacker?

REMEMBER: If even ONE legal move exists that gets out of check, it's CHECK, not CHECKMATE.

Important: The legal moves listed above are already filtered - they all get the king out of check. If any moves are listed, it's CHECK, not CHECKMATE.`;
    }

    findAttackingPieces(gameState, kingSquare, attackingColor) {
        const attackers = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];
                if (piece && piece.color === attackingColor) {
                    const square = gameState.squareToString(file, rank);
                    const moves = gameState.generatePieceMoves(square, piece, false);
                    if (moves.includes(kingSquare)) {
                        const pieceType = piece.type === 'knight' ? 'N' : 
                                        piece.type === 'bishop' ? 'B' :
                                        piece.type === 'rook' ? 'R' :
                                        piece.type === 'queen' ? 'Q' :
                                        piece.type === 'king' ? 'K' : 'P';
                        attackers.push(`${pieceType}${square}`);
                    }
                }
            }
        }
        
        return attackers;
    }

    // Add parseChessMove as an instance method, not just as a function
    parseChessMove(moveText) {
        console.log('Parsing move text:', moveText);
        
        // Normalize line endings and trim whitespace
        const text = moveText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        
        // Split by lines and filter out empty lines
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // Look for move patterns in the last few lines
        const movePatterns = [
            /^([a-h][1-8])$/,                    // Simple pawn moves: e4, d5
            /^([KQRBN][a-h][1-8])$/,            // Piece moves: Nf3, Bb5
            /^([a-h]x[a-h][1-8])$/,             // Pawn captures: exd5
            /^([KQRBN]x[a-h][1-8])$/,           // Piece captures: Nxe4
            /^(O-O-O|O-O)$/,                    // Castling
            /^([a-h][18]=[QRBN])$/,             // Promotion: e8=Q
            /^([KQRBN][a-h]\d?[a-h][1-8])$/,    // Disambiguated moves: Nbd2
            /\b([a-h][1-8])\b/,                 // Any square notation
            /\b([KQRBN][a-h][1-8])\b/,          // Any piece move
            /\b(O-O-O|O-O)\b/                   // Castling anywhere in text
        ];
        
        // Check lines from end to beginning for move patterns
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
            const line = lines[i];
            
            for (const pattern of movePatterns) {
                const match = line.match(pattern);
                if (match) {
                    let move = match[1] || match[0];
                    
                    // Clean up move notation
                    move = move.replace(/[+#!?]$/, ''); // Remove check/checkmate/annotation symbols
                    move = move.replace(/^\d+\.\s*\.{3}\s*/, ''); // Remove "1. ... " notation
                    move = move.replace(/^\d+\.\s*/, ''); // Remove move numbers
                    
                    console.log('Found move:', move);
                    return move;
                }
            }
        }
        
        // If no clear move pattern found, try to extract from the last line
        const lastLine = lines[lines.length - 1];
        
        // Remove common prefixes and suffixes
        let cleanedLine = lastLine
            .replace(/^(Selected move|Move|Final move|I play|My move):\s*/i, '')
            .replace(/^\d+\.\s*\.{3}\s*/, '')
            .replace(/^\d+\.\s*/, '')
            .replace(/[+#!?]*$/, '')
            .trim();
        
        // If it looks like a move, return it
        if (/^[a-h][1-8]$|^[KQRBN][a-h][1-8]$|^O-O|^[a-h]x[a-h][1-8]$/.test(cleanedLine)) {
            console.log('Extracted move from last line:', cleanedLine);
            return cleanedLine;
        }
        
        console.log('Could not parse move from text, returning last line:', lastLine);
        return lastLine;
    }

    async getOpenAIResponse(systemPrompt, userPrompt) {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key is required');
        }

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
                temperature: 0.1, // Low temperature for accurate analysis
                max_tokens: 500,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
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
                temperature: 0.1, // Low temperature for accurate analysis
                max_tokens: 500,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }
}

