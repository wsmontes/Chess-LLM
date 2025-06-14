class LLMClient {
    constructor() {
        this.endpoint = 'http://localhost:1234';
        this.model = 'google/gemma-3-4b';
        this.temperature = 0.3;
        this.isConnected = false;
        this.lastError = null;
        this.onThinkingUpdate = null; // Callback for thinking updates
    }

    async testConnection() {
        try {
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
        } catch (error) {
            this.isConnected = false;
            this.lastError = error.message;
            return { success: false, message: error.message };
        }
    }

    async getChessMove(gameState, moveHistory, previousAttempt = null) {
        try {
            const systemPrompt = this.buildSystemPrompt();
            const userPrompt = this.buildUserPrompt(gameState, moveHistory, previousAttempt);

            // Use streaming for real-time thinking display
            if (this.onThinkingUpdate) {
                return await this.getChessMoveWithStreaming(systemPrompt, userPrompt);
            } else {
                return await this.getChessMoveNormal(systemPrompt, userPrompt);
            }
        } catch (error) {
            console.error('Error getting chess move from LLM:', error);
            throw error;
        }
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
        
        // Build detailed move history
        let moveHistoryText = '';
        if (moveHistory.length > 0) {
            const recentMoves = moveHistory.slice(-8); // Last 8 moves for better context
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

MOVE HISTORY: ${moveHistoryText || 'Game just started'}

YOUR BLACK PIECES CURRENTLY ON BOARD: ${blackPieceDescription}
WHITE PIECES CURRENTLY ON BOARD: ${whitePieceDescription}

LEGAL MOVES AVAILABLE TO YOU RIGHT NOW: ${legalMoves.join(', ')}

IMPORTANT: Analyze the FEN notation above to see the EXACT current position. Do not assume where pieces should be - look at where they actually are.`;

        // Add feedback from previous invalid attempt
        if (previousAttempt) {
            prompt += `

⚠️ PREVIOUS ATTEMPT CORRECTION:
Your last move "${previousAttempt.move}" was INVALID.
Reason: ${previousAttempt.reason}

Please analyze why this move was invalid and choose a different legal move from the list above.`;
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

    parseChessMove(moveText) {
        console.log('Parsing LLM response:', moveText);
        
        // Split into lines and look for move patterns
        const lines = moveText.split('\n').map(line => line.trim()).filter(line => line);
        let move = null;

        // First, try to find a move in the last few lines (most likely to be the final decision)
        for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
            const line = lines[i];
            
            // Skip lines with too much text (likely analysis)
            if (line.length > 10) continue;
            
            // Look for simple move patterns
            const movePatterns = [
                /^([KQRBN][a-h][1-8])$/,           // Piece moves: Nf6, Bb4
                /^([a-h][1-8])$/,                  // Pawn moves: e5, d6
                /^([KQRBN]x[a-h][1-8])$/,         // Piece captures: Nxe4
                /^([a-h]x[a-h][1-8])$/,           // Pawn captures: exd4
                /^(O-O-O|O-O)$/                    // Castling
            ];

            for (const pattern of movePatterns) {
                const match = line.match(pattern);
                if (match) {
                    const candidate = match[1];
                    if (this.isValidBlackMoveFormat(candidate)) {
                        move = candidate;
                        console.log('Found move in line:', line, '-> Move:', move);
                        break;
                    }
                }
            }
            if (move) break;
        }

        // If no move found in final lines, search the entire text
        if (!move) {
            // Look for moves mentioned in analysis that could be the final choice
            const allText = moveText.toLowerCase();
            
            // Common Black opening moves to look for
            const commonMoves = ['nf6', 'nc6', 'e6', 'e5', 'd6', 'd5', 'c6', 'c5', 'g6', 'f5'];
            
            for (const commonMove of commonMoves) {
                // Look for patterns like "I choose Nf6" or "Nf6 is best" or just "Nf6" at end
                const patterns = [
                    new RegExp(`\\b(${commonMove})\\s*$`, 'i'),                    // Move at end
                    new RegExp(`\\bchoose\\s+(${commonMove})\\b`, 'i'),            // "choose Nf6"
                    new RegExp(`\\bplay\\s+(${commonMove})\\b`, 'i'),              // "play Nf6"
                    new RegExp(`\\b(${commonMove})\\s+is\\s+best\\b`, 'i'),        // "Nf6 is best"
                    new RegExp(`\\bi\\s+will\\s+play\\s+(${commonMove})\\b`, 'i')  // "I will play Nf6"
                ];
                
                for (const pattern of patterns) {
                    const match = allText.match(pattern);
                    if (match) {
                        const candidate = match[1].charAt(0).toUpperCase() + match[1].slice(1); // Capitalize
                        if (this.isValidBlackMoveFormat(candidate)) {
                            move = candidate;
                            console.log('Found move in analysis:', candidate);
                            break;
                        }
                    }
                }
                if (move) break;
            }
        }

        // Last resort: look for any chess notation in the text
        if (!move) {
            const allMatches = moveText.match(/\b([KQRBN]?[a-h][1-8]|O-O(?:-O)?)\b/g);
            if (allMatches) {
                // Take the last valid move
                for (let i = allMatches.length - 1; i >= 0; i--) {
                    if (this.isValidBlackMoveFormat(allMatches[i])) {
                        move = allMatches[i];
                        console.log('Found move as last resort:', move);
                        break;
                    }
                }
            }
        }

        if (!move) {
            console.error('Could not parse move from:', moveText);
            throw new Error(`Could not parse chess move from LLM response. The LLM must end its response with a valid move notation.`);
        }

        return move.trim();
    }

    isValidBlackMoveFormat(moveText) {
        const cleaned = moveText.trim();
        
        // Skip obvious White opening moves
        if (['e4', 'd4', 'Nf3', 'Bc4', 'Bb5'].includes(cleaned)) {
            return false;
        }
        
        // Check valid formats
        const validPatterns = [
            /^[a-h][1-8]$/,                    // Simple pawn move
            /^[a-h]x[a-h][1-8]$/,             // Pawn capture
            /^[KQRBN][a-h][1-8]$/,            // Piece move
            /^[KQRBN][a-h]?[1-8]?x[a-h][1-8]$/, // Piece capture
            /^O-O(-O)?$/                       // Castling
        ];
        
        return validPatterns.some(pattern => pattern.test(cleaned));
    }

    async getHint(gameState, moveHistory, playerColor) {
        try {
            const systemPrompt = `You are a chess coach providing helpful hints to a ${playerColor} player. 
Analyze the position and suggest a good move with a brief explanation (1-2 sentences).
Format: "Move: [move] - [brief explanation]"`;

            const userPrompt = this.buildUserPrompt(gameState, moveHistory);

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
            endpoint: this.endpoint,
            model: this.model,
            temperature: this.temperature,
            lastError: this.lastError
        };
    }

    setThinkingCallback(callback) {
        this.onThinkingUpdate = callback;
    }
}

