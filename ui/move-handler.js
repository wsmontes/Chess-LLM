class MoveHandler {
    constructor(engine, llm, boardManager, thinkingDisplay) {
        this.engine = engine;
        this.llm = llm;
        this.boardManager = boardManager;
        this.thinkingDisplay = thinkingDisplay;
        this.isWaitingForLLM = false;
        this.deepThinkingEnabled = true; // Enable deep thinking by default
        this.maxThinkingIterations = 3;
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
        const moveTimeout = 60000; // Increased timeout for deep thinking
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

            let moveNotation;
            
            if (this.deepThinkingEnabled && !previousAttempt) {
                // Use iterative deep thinking for new moves
                moveNotation = await this.getDeepThinkingMove();
            } else {
                // Use regular thinking for retries or when deep thinking is disabled
                const attemptData = previousAttempt ? {
                    ...previousAttempt,
                    attemptNumber: attemptCount + 1
                } : null;
                
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

    async getDeepThinkingMove() {
        console.log('🧠 Starting simplified deep thinking...');
        
        if (this.thinkingDisplay) {
            this.thinkingDisplay.addDeepThinkingIndicator(true, 'Deep analysis...');
        }

        try {
            // Just do 2 focused iterations instead of 3 vague ones
            const phases = [
                { name: 'tactical', focus: 'Tactical opportunities and forcing moves' },
                { name: 'strategic', focus: 'Strategic evaluation and best move selection' }
            ];

            let bestMove = null;
            let bestReasoning = '';

            for (let i = 0; i < phases.length; i++) {
                const phase = phases[i];
                console.log(`Deep thinking iteration ${i + 1}/2: ${phase.focus}`);
                
                if (this.thinkingDisplay) {
                    this.thinkingDisplay.addIterationHeader(i + 1, phases.length, phase.name);
                }

                const iterationResult = await this.getSimplifiedIterationAnalysis(i + 1, phases.length, phase);
                
                if (iterationResult.recommendedMove) {
                    bestMove = iterationResult.recommendedMove;
                    bestReasoning = iterationResult.reasoning || 'Analysis complete';
                }
                
                if (this.thinkingDisplay) {
                    this.thinkingDisplay.addIterationSummary(
                        i + 1,
                        iterationResult.analysis || 'Analysis in progress',
                        iterationResult.candidateMoves || []
                    );
                }
            }

            if (this.thinkingDisplay) {
                this.thinkingDisplay.addDeepThinkingIndicator(false);
                this.thinkingDisplay.updateThinkingDisplay([
                    {
                        type: 'deep-evaluation',
                        content: `After 2 iterations of focused analysis:\n\n${bestReasoning}`,
                        iteration: 'Final'
                    },
                    {
                        type: 'final',
                        content: `Selected move: ${bestMove}`,
                        iteration: 'Final'
                    }
                ]);
            }

            return bestMove || 'e5'; // Fallback to a reasonable move

        } catch (error) {
            console.error('Error in deep thinking:', error);
            
            if (this.thinkingDisplay) {
                this.thinkingDisplay.addDeepThinkingIndicator(false);
            }
            
            // Just get a regular move
            return await this.llm.getChessMove(this.engine, this.engine.moveHistory, null);
        }
    }

    async getSimplifiedIterationAnalysis(iterationNum, totalIterations, phase) {
        const systemPrompt = `You are a Chess Grandmaster analyzing as BLACK. Iteration ${iterationNum}/${totalIterations}.

FOCUS: ${phase.focus}

Find the strongest move for Black. Be practical and concrete.

RESPONSE FORMAT:
ANALYSIS: [Brief position assessment - 1-2 sentences]
CANDIDATE MOVES: [List 3-4 moves: move1, move2, move3]
RECOMMENDED MOVE: [Your top choice]
REASONING: [Why this move is best - 2 sentences max]`;

        const userPrompt = this.buildDeepAnalysisUserPrompt(phase, '', []);

        try {
            let response;
            if (this.llm.provider === 'openai') {
                response = await this.llm.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.llm.getLMStudioResponse(systemPrompt, userPrompt);
            }

            return this.parseSimplifiedIterationResponse(response);

        } catch (error) {
            console.error(`Error in iteration ${iterationNum}:`, error);
            return {
                analysis: `Iteration ${iterationNum} failed`,
                candidateMoves: ['e5', 'Nf6', 'd6'],
                recommendedMove: 'e5',
                reasoning: 'Fallback to solid development'
            };
        }
    }

    parseSimplifiedIterationResponse(response) {
        const result = {
            analysis: '',
            candidateMoves: [],
            recommendedMove: '',
            reasoning: ''
        };

        const lines = response.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('ANALYSIS:')) {
                result.analysis = trimmed.replace('ANALYSIS:', '').trim();
            } else if (trimmed.startsWith('CANDIDATE MOVES:')) {
                const movesText = trimmed.replace('CANDIDATE MOVES:', '').trim();
                result.candidateMoves = this.extractMovesFromText(movesText);
            } else if (trimmed.startsWith('RECOMMENDED MOVE:')) {
                result.recommendedMove = this.extractMoveFromText(trimmed.replace('RECOMMENDED MOVE:', '').trim());
            } else if (trimmed.startsWith('REASONING:')) {
                result.reasoning = trimmed.replace('REASONING:', '').trim();
            }
        }

        // Update thinking display
        if (this.thinkingDisplay) {
            const steps = [];
            
            if (result.analysis) {
                steps.push({
                    type: 'analysis',
                    content: result.analysis
                });
            }
            
            if (result.candidateMoves.length > 0) {
                steps.push({
                    type: 'candidate-moves',
                    content: `Candidates: ${result.candidateMoves.join(', ')}`
                });
            }
            
            this.thinkingDisplay.updateThinkingDisplay(steps);
        }

        return result;
    }

    async getIterationAnalysis(iterationNum, totalIterations, phase, previousKnowledge, previousCandidates) {
        const systemPrompt = this.buildDeepAnalysisSystemPrompt(phase, iterationNum, totalIterations);
        const userPrompt = this.buildDeepAnalysisUserPrompt(phase, previousKnowledge, previousCandidates);

        try {
            let response;
            if (this.llm.provider === 'openai') {
                response = await this.llm.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.llm.getLMStudioResponse(systemPrompt, userPrompt);
            }

            // Parse the structured response - pass phase parameter
            return this.parseIterationResponse(response, iterationNum, phase);

        } catch (error) {
            console.error(`Error in iteration ${iterationNum}:`, error);
            return {
                analysis: `Iteration ${iterationNum} analysis failed: ${error.message}`,
                candidateMoves: previousCandidates,
                keyFindings: 'Error in analysis',
                recommendedMove: previousCandidates.length > 0 ? previousCandidates[0] : null
            };
        }
    }

    parseIterationResponse(response, iterationNum, phase) {
        try {
            const sections = {
                analysis: '',
                keyFindings: '',
                candidateMoves: [],
                recommendedMove: '',
                reasoning: ''
            };

            // Split response into sections
            const lines = response.split('\n');
            let currentSection = '';
            let sectionContent = [];

            for (const line of lines) {
                const trimmed = line.trim();
                
                if (trimmed.startsWith('=== ANALYSIS ===')) {
                    currentSection = 'analysis';
                    sectionContent = [];
                } else if (trimmed.startsWith('=== KEY FINDINGS ===')) {
                    if (currentSection === 'analysis') {
                        sections.analysis = sectionContent.join('\n').trim();
                    }
                    currentSection = 'keyFindings';
                    sectionContent = [];
                } else if (trimmed.startsWith('=== CANDIDATE MOVES ===')) {
                    if (currentSection === 'keyFindings') {
                        sections.keyFindings = sectionContent.join('\n').trim();
                    }
                    currentSection = 'candidateMoves';
                    sectionContent = [];
                } else if (trimmed.startsWith('=== RECOMMENDED MOVE ===')) {
                    if (currentSection === 'candidateMoves') {
                        const movesText = sectionContent.join('\n');
                        sections.candidateMoves = this.extractMovesFromText(movesText);
                    }
                    currentSection = 'recommendedMove';
                    sectionContent = [];
                } else if (trimmed.startsWith('=== REASONING ===')) {
                    if (currentSection === 'recommendedMove') {
                        sections.recommendedMove = this.extractMoveFromText(sectionContent.join('\n'));
                    }
                    currentSection = 'reasoning';
                    sectionContent = [];
                } else if (trimmed && !trimmed.startsWith('===')) {
                    sectionContent.push(trimmed);
                }
            }

            // Handle the last section
            if (currentSection === 'reasoning') {
                sections.reasoning = sectionContent.join('\n').trim();
            } else if (currentSection === 'recommendedMove') {
                sections.recommendedMove = this.extractMoveFromText(sectionContent.join('\n'));
            }

            // Update thinking display with structured information
            if (this.thinkingDisplay) {
                const steps = [];
                
                if (sections.analysis) {
                    steps.push({
                        type: phase.name === 'initial' ? 'analysis' : 
                              phase.name === 'tactical' ? 'tactical-analysis' : 'strategic-analysis',
                        content: sections.analysis,
                        iteration: iterationNum
                    });
                }
                
                if (sections.candidateMoves.length > 0) {
                    steps.push({
                        type: 'candidate-moves',
                        content: `Top candidate moves:\n${sections.candidateMoves.slice(0, 5).join(', ')}`,
                        iteration: iterationNum
                    });
                }
                
                this.thinkingDisplay.updateThinkingDisplay(steps);
            }

            return sections;

        } catch (error) {
            console.error('Error parsing iteration response:', error);
            return {
                analysis: response.substring(0, 500) + '...',
                candidateMoves: [],
                keyFindings: 'Parsing error occurred',
                recommendedMove: null,
                reasoning: 'Could not parse structured response'
            };
        }
    }

    async synthesizeFinalMove(accumulatedKnowledge, candidateMoves) {
        const systemPrompt = LLMPrompts.getFinalSynthesisPrompt();

        const userPrompt = `ACCUMULATED ANALYSIS:
${accumulatedKnowledge}

TOP CANDIDATE MOVES: ${candidateMoves.slice(0, 5).join(', ')}

Make your final decision and provide the move with reasoning.`;

        try {
            let response;
            if (this.llm.provider === 'openai') {
                response = await this.llm.getOpenAIResponse(systemPrompt, userPrompt);
            } else {
                response = await this.llm.getLMStudioResponse(systemPrompt, userPrompt);
            }

            const lines = response.split('\n');
            let move = null;
            let reasoning = '';

            for (const line of lines) {
                if (line.includes('FINAL MOVE:')) {
                    const moveMatch = line.match(/FINAL MOVE:\s*([a-h][1-8]|[KQRBN][a-h][1-8]|O-O-O|O-O)/);
                    if (moveMatch) {
                        move = moveMatch[1];
                    }
                } else if (line.includes('REASONING:')) {
                    reasoning = line.replace('REASONING:', '').trim();
                }
            }

            return {
                move: move || (candidateMoves.length > 0 ? candidateMoves[0] : null),
                reasoning: reasoning || 'Final synthesis complete.'
            };

        } catch (error) {
            console.error('Error in final synthesis:', error);
            return {
                move: candidateMoves.length > 0 ? candidateMoves[0] : null,
                reasoning: 'Final synthesis failed, using top candidate.'
            };
        }
    }

    extractMovesFromText(text) {
        const movePattern = /\b([a-h][1-8]|[KQRBN][a-h][1-8]|O-O-O|O-O|[a-h]x[a-h][1-8]|[KQRBN]x[a-h][1-8])\b/g;
        const matches = text.match(movePattern) || [];
        return [...new Set(matches)]; // Remove duplicates
    }

    extractMoveFromText(text) {
        const moves = this.extractMovesFromText(text);
        return moves.length > 0 ? moves[0] : null;
    }

    validateLLMMove(moveNotation) {
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
        
        // Enhanced error analysis with chess principles
        if (/^[KQRBN][a-h][1-8]$/.test(cleanMove)) {
            const pieceType = {
                'K': 'king', 'Q': 'queen', 'R': 'rook',
                'B': 'bishop', 'N': 'knight'
            }[cleanMove[0]];
            const destination = cleanMove.slice(1);
            
            const piecesOfType = possibleMoves.filter(m => m.piece === pieceType);
            const currentPositions = piecePositions.get(pieceType) || [];
            
            if (piecesOfType.length === 0) {
                reason += `ANALYSIS: No ${pieceType} can move right now.\n`;
                reason += `CURRENT POSITION: Your ${pieceType} is on ${currentPositions.join(', ')}\n`;
                reason += `CHESS PRINCIPLE: Check if the piece is blocked by other pieces or if the move would leave your king in check.\n`;
                
                // Add specific blocking analysis
                if (pieceType === 'bishop') {
                    reason += `BISHOP MOVEMENT: Bishops move diagonally and cannot jump over pieces. Check for pawn or piece blockages on diagonal paths.\n`;
                } else if (pieceType === 'rook') {
                    reason += `ROOK MOVEMENT: Rooks move in straight lines and cannot jump over pieces. Check for blockages on ranks and files.\n`;
                } else if (pieceType === 'queen') {
                    reason += `QUEEN MOVEMENT: Queens combine rook and bishop movement but cannot jump over pieces.\n`;
                }
            } else {
                const validDestinations = [...new Set(piecesOfType.map(m => m.to))];
                reason += `ANALYSIS: Your ${pieceType} cannot reach ${destination}.\n`;
                reason += `CURRENT POSITION: Your ${pieceType} is on ${currentPositions.join(', ')}\n`;
                reason += `VALID DESTINATIONS: ${validDestinations.join(', ')}\n`;
                reason += `CHESS INSIGHT: Consider the piece's movement pattern and check for obstructions.\n`;
            }
        } else if (/^[a-h][1-8]$/.test(cleanMove)) {
            // Enhanced pawn move analysis
            const destination = cleanMove;
            const pawnMoves = possibleMoves.filter(m => m.piece === 'pawn');
            const pawnPositions = piecePositions.get('pawn') || [];
            
            if (pawnMoves.length === 0) {
                reason += `ANALYSIS: No pawns can move right now.\n`;
                reason += `CURRENT POSITION: Your pawns are on ${pawnPositions.join(', ')}\n`;
                reason += `PAWN PRINCIPLES: Pawns move forward one square (or two from starting position) and capture diagonally.\n`;
                reason += `BLOCKING ISSUE: All pawns are either blocked by pieces ahead or cannot legally advance.\n`;
            } else {
                const validPawnDestinations = [...new Set(pawnMoves.map(m => m.to))];
                reason += `ANALYSIS: No pawn can move to ${destination}.\n`;
                reason += `CURRENT POSITION: Your pawns are on ${pawnPositions.join(', ')}\n`;
                reason += `VALID PAWN MOVES: ${validPawnDestinations.join(', ')}\n`;
                reason += `PAWN MOVEMENT: Remember pawns can only move forward and capture diagonally.\n`;
            }
        } else if (/^[a-h]x[a-h][1-8]$/.test(cleanMove)) {
            // Pawn capture analysis
            reason += `PAWN CAPTURE ANALYSIS: "${cleanMove}" represents a pawn capture.\n`;
            reason += `REQUIREMENT: There must be an enemy piece on the destination square to capture.\n`;
            reason += `CHECK: Verify an opponent's piece is actually on the target square.\n`;
        } else if (/^[KQRBN]x[a-h][1-8]$/.test(cleanMove)) {
            // Piece capture analysis
            const pieceType = cleanMove[0];
            const destination = cleanMove.slice(2);
            reason += `PIECE CAPTURE ANALYSIS: ${pieceType} attempting to capture on ${destination}.\n`;
            reason += `REQUIREMENT: The destination square must contain an opponent's piece.\n`;
            reason += `MOVEMENT: The piece must be able to legally reach the destination square.\n`;
        } else if (cleanMove === 'O-O' || cleanMove === 'O-O-O') {
            // Castling analysis
            const side = cleanMove === 'O-O' ? 'kingside' : 'queenside';
            reason += `CASTLING ANALYSIS: Attempting ${side} castling.\n`;
            reason += `CASTLING REQUIREMENTS:\n`;
            reason += `1. King and rook must not have moved previously\n`;
            reason += `2. No pieces between king and rook\n`;
            reason += `3. King not in check\n`;
            reason += `4. King doesn't pass through or land on attacked squares\n`;
        }
        
        // Add chess learning points
        reason += `\nCHESS LEARNING POINTS:\n`;
        reason += `• Always verify piece movement patterns (how each piece actually moves)\n`;
        reason += `• Check for piece blockages (pieces cannot jump over others except knights)\n`;
        reason += `• Ensure moves don't leave your own king in check\n`;
        reason += `• Remember special rules (en passant, castling, pawn promotion)\n`;
        
        const topMoves = possibleMoves.slice(0, 5).map(m => m.notation);
        reason += `\nRECOMMENDED LEGAL MOVES: ${topMoves.join(', ')}`;
        
        return reason;
    }

    parseAndExecuteMove(moveNotation) {
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
        // Enhanced chess-based move suggestions with stronger priorities
        console.log(`Suggesting alternative to invalid move: ${invalidMove}`);
        
        // Priority 1: Address immediate threats (king in check, hanging pieces)
        const defensiveMoves = this.findDefensiveMoves(possibleMoves);
        if (defensiveMoves.length > 0) {
            console.log('Found defensive move:', defensiveMoves[0].notation);
            return defensiveMoves[0];
        }
        
        // Priority 2: Tactical opportunities (captures, checks, threats)
        const tacticalMoves = this.findTacticalMoves(possibleMoves);
        if (tacticalMoves.length > 0) {
            console.log('Found tactical move:', tacticalMoves[0].notation);
            return tacticalMoves[0];
        }
        
        // Priority 3: Good developing moves based on opening principles
        const developingMoves = this.findDevelopingMoves(possibleMoves);
        if (developingMoves.length > 0) {
            console.log('Found developing move:', developingMoves[0].notation);
            return developingMoves[0];
        }
        
        // Priority 4: Central control moves
        const centralMoves = this.findCentralMoves(possibleMoves);
        if (centralMoves.length > 0) {
            console.log('Found central move:', centralMoves[0].notation);
            return centralMoves[0];
        }
        
        // Fallback: Any reasonable move
        const reasonableMoves = possibleMoves.filter(move => 
            !this.isObviouslyBad(move)
        );
        
        if (reasonableMoves.length > 0) {
            console.log('Using reasonable fallback move:', reasonableMoves[0].notation);
            return reasonableMoves[0];
        }
        
        console.log('Using first available move as last resort');
        return possibleMoves[0] || null;
    }

    findDefensiveMoves(possibleMoves) {
        const defensive = [];
        
        for (const move of possibleMoves) {
            // Check if this move gets out of check
            if (this.engine.isKingInCheck('black')) {
                // Simulate the move to see if it resolves check
                if (this.moveResolvesCheck(move)) {
                    defensive.push(move);
                }
            }
            
            // Check if this move defends a hanging piece
            if (this.moveDefendsHangingPiece(move)) {
                defensive.push(move);
            }
            
            // Check if this move blocks a dangerous threat
            if (this.moveBlocksThreat(move)) {
                defensive.push(move);
            }
        }
        
        return defensive;
    }

    findTacticalMoves(possibleMoves) {
        const tactical = [];
        
        for (const move of possibleMoves) {
            // Captures (especially of higher value pieces)
            if (move.to && this.engine.getPiece(move.to)) {
                const capturedPiece = this.engine.getPiece(move.to);
                if (capturedPiece && capturedPiece.color === 'white') {
                    // Prioritize by piece value
                    const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
                    const value = pieceValues[capturedPiece.type] || 0;
                    tactical.push({ ...move, tacticalValue: value + 10 }); // Bonus for captures
                }
            }
            
            // Checks
            if (this.moveGivesCheck(move)) {
                tactical.push({ ...move, tacticalValue: 8 }); // High value for checks
            }
            
            // Attacks on valuable pieces
            if (this.moveAttacksValuablePiece(move)) {
                tactical.push({ ...move, tacticalValue: 6 });
            }
        }
        
        // Sort by tactical value
        return tactical.sort((a, b) => (b.tacticalValue || 0) - (a.tacticalValue || 0));
    }

    findDevelopingMoves(possibleMoves) {
        const developing = [];
        const moveCount = this.engine.moveHistory.length;
        
        // Opening phase - prioritize development
        if (moveCount < 20) {
            for (const move of possibleMoves) {
                const piece = this.engine.getPiece(move.from);
                
                // Knight development
                if (piece.type === 'knight') {
                    const goodKnightSquares = ['f6', 'c6', 'e7', 'd7'];
                    if (goodKnightSquares.includes(move.to)) {
                        developing.push({ ...move, developValue: 10 });
                    } else if (!['a3', 'a6', 'h3', 'h6'].includes(move.to)) {
                        developing.push({ ...move, developValue: 7 });
                    }
                }
                
                // Bishop development
                if (piece.type === 'bishop') {
                    const goodBishopSquares = ['c5', 'f5', 'b4', 'g4', 'e7', 'd7', 'e6', 'd6'];
                    if (goodBishopSquares.includes(move.to)) {
                        developing.push({ ...move, developValue: 9 });
                    }
                }
                
                // Castling
                if (piece.type === 'king' && Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0)) === 2) {
                    developing.push({ ...move, developValue: 12 }); // High priority for castling
                }
                
                // Central pawn moves
                if (piece.type === 'pawn') {
                    const centralSquares = ['e5', 'd5', 'e6', 'd6', 'c5', 'f5'];
                    if (centralSquares.includes(move.to)) {
                        developing.push({ ...move, developValue: 8 });
                    }
                }
            }
        }
        
        return developing.sort((a, b) => (b.developValue || 0) - (a.developValue || 0));
    }

    findCentralMoves(possibleMoves) {
        const central = [];
        const centralSquares = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5'];
        const nearCentralSquares = ['c6', 'd6', 'e6', 'f6', 'c3', 'd3', 'e3', 'f3'];
        
        for (const move of possibleMoves) {
            if (centralSquares.includes(move.to)) {
                central.push({ ...move, centralValue: 10 });
            } else if (nearCentralSquares.includes(move.to)) {
                central.push({ ...move, centralValue: 6 });
            }
        }
        
        return central.sort((a, b) => (b.centralValue || 0) - (a.centralValue || 0));
    }

    moveResolvesCheck(move) {
        // Simulate move to see if it gets out of check
        const originalGameState = {
            board: this.engine.board.map(row => [...row]),
            currentPlayer: this.engine.currentPlayer
        };
        
        try {
            // Temporarily make the move
            const piece = this.engine.getPiece(move.from);
            const captured = this.engine.getPiece(move.to);
            
            this.engine.setPiece(move.to, piece);
            this.engine.setPiece(move.from, null);
            
            const stillInCheck = this.engine.isKingInCheck('black');
            
            // Restore position
            this.engine.setPiece(move.from, piece);
            this.engine.setPiece(move.to, captured);
            
            return !stillInCheck;
        } catch (error) {
            // Restore position on error
            this.engine.board = originalGameState.board;
            return false;
        }
    }

    moveDefendsHangingPiece(move) {
        // Check if this move defends a piece that's currently hanging
        // This is a simplified check - could be more sophisticated
        const piece = this.engine.getPiece(move.from);
        
        // If moving piece was defending something, this might not be defensive
        // If moving piece to defend something, this could be defensive
        // For now, return false - this needs more complex analysis
        return false;
    }

    moveBlocksThreat(move) {
        // Check if this move blocks a dangerous threat
        // Simplified implementation
        const to = move.to;
        const piece = this.engine.getPiece(move.from);
        
        // Check if the move blocks check
        if (this.engine.isKingInCheck('black')) {
            return this.moveResolvesCheck(move);
        }
        
        return false;
    }

    moveGivesCheck(move) {
        try {
            // Simulate the move
            const piece = this.engine.getPiece(move.from);
            const captured = this.engine.getPiece(move.to);
            
            this.engine.setPiece(move.to, piece);
            this.engine.setPiece(move.from, null);
            
            const givesCheck = this.engine.isKingInCheck('white');
            
            // Restore position
            this.engine.setPiece(move.from, piece);
            this.engine.setPiece(move.to, captured);
            
            return givesCheck;
        } catch (error) {
            return false;
        }
    }

    moveAttacksValuablePiece(move) {
        // Check if this move attacks an opponent's valuable piece
        const piece = this.engine.getPiece(move.from);
        if (!piece) return false;
        
        try {
            // Get moves from the destination square
            const attackedSquares = this.engine.generatePieceMoves(move.to, piece, false);
            
            for (const attacked of attackedSquares) {
                const targetPiece = this.engine.getPiece(attacked);
                if (targetPiece && targetPiece.color === 'white') {
                    const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
                    if (pieceValues[targetPiece.type] >= 3) { // Attack on minor piece or better
                        return true;
                    }
                }
            }
        } catch (error) {
            return false;
        }
        
        return false;
    }

    isObviouslyBad(move) {
        // Check for obviously bad moves to avoid
        const piece = this.engine.getPiece(move.from);
        if (!piece) return true;
        
        // Don't move into corners unnecessarily in opening
        if (this.engine.moveHistory.length < 15) {
            const cornerSquares = ['a1', 'a8', 'h1', 'h8'];
            if (cornerSquares.includes(move.to) && piece.type !== 'rook') {
                return true;
            }
            
            // Don't move knights to edge in opening
            if (piece.type === 'knight') {
                const edgeSquares = ['a3', 'a6', 'h3', 'h6'];
                if (edgeSquares.includes(move.to)) {
                    return true;
                }
            }
        }
        
        // Check if move hangs the piece
        try {
            const originalBoard = this.engine.board.map(row => [...row]);
            
            // Simulate move
            this.engine.setPiece(move.to, piece);
            this.engine.setPiece(move.from, null);
            
            const isHanging = this.engine.isSquareAttacked(move.to, 'white') && 
                              !this.engine.isSquareAttacked(move.to, 'black');
            
            // Restore board
            this.engine.board = originalBoard;
            
            if (isHanging) {
                const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
                return pieceValues[piece.type] > 1; // Don't hang valuable pieces
            }
        } catch (error) {
            return false;
        }
        
        return false;
    }

    buildDeepAnalysisUserPrompt(phase, previousKnowledge, previousCandidates) {
        const fen = this.engine.getBoardAsFEN();
        const moveHistory = this.engine.moveHistory.join(' ');
        const materialBalance = this.engine.getMaterialBalance();
        const isCheck = this.engine.isKingInCheck('black');
        const legalMoves = this.engine.getLegalMovesForColor('black');

        let prompt = `You are analyzing the position as Black. Focus on ${phase.focus}.\n\n`;
        prompt += `Current Position:\n`;
        prompt += `FEN: ${fen}\n`;
        prompt += `Move History: ${moveHistory}\n\n`;
        
        prompt += `Position Assessment:\n`;
        prompt += `- Material Balance: ${materialBalance > 0 ? '+' : ''}${materialBalance}\n`;
        prompt += `- Black King in Check: ${isCheck ? 'Yes' : 'No'}\n`;
        prompt += `- Available Legal Moves: ${legalMoves.join(', ')}\n\n`;
        
        prompt += `Analysis Guidelines:\n`;
        prompt += `1. First, analyze the current position:\n`;
        prompt += `   - Material balance and piece activity\n`;
        prompt += `   - Pawn structure and weaknesses\n`;
        prompt += `   - King safety and development\n`;
        prompt += `   - Control of key squares and files\n\n`;
        
        prompt += `2. Identify immediate threats and opportunities:\n`;
        prompt += `   - Tactical possibilities (checks, captures, threats)\n`;
        prompt += `   - Strategic goals (development, space, initiative)\n`;
        prompt += `   - Opponent's threats that need to be addressed\n\n`;
        
        prompt += `3. Evaluate candidate moves:\n`;
        prompt += `   - Only consider legal moves from the list above\n`;
        prompt += `   - Assess each move's impact on position\n`;
        prompt += `   - Consider both immediate and long-term consequences\n\n`;
        
        if (previousKnowledge) {
            prompt += `Previous Analysis:\n${previousKnowledge}\n\n`;
        }
        
        if (previousCandidates && previousCandidates.length > 0) {
            prompt += `Previous Candidate Moves: ${previousCandidates.join(', ')}\n\n`;
        }
        
        prompt += `Please provide your analysis in this format:\n`;
        prompt += `1. Position Assessment: [Your detailed analysis]\n`;
        prompt += `2. Threats & Opportunities: [List key points]\n`;
        prompt += `3. Candidate Moves:\n`;
        prompt += `   - [Move 1]: [Brief explanation]\n`;
        prompt += `   - [Move 2]: [Brief explanation]\n`;
        prompt += `   - [Move 3]: [Brief explanation]\n`;
        prompt += `4. Recommended Move: [Your choice with detailed reasoning]\n`;
        
        return prompt;
    }
}
