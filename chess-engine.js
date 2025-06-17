class ChessEngine {
    constructor() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'white';
        this.moveHistory = [];
        this.gameState = 'playing'; // playing, check, checkmate, stalemate, draw
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true }
        };
        this.halfmoveClock = 0;
        this.fullmoveNumber = 1;
    }

    initializeBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // Initial piece setup
        const pieces = {
            // White pieces
            'a1': { type: 'rook', color: 'white', symbol: '♖' },
            'b1': { type: 'knight', color: 'white', symbol: '♘' },
            'c1': { type: 'bishop', color: 'white', symbol: '♗' },
            'd1': { type: 'queen', color: 'white', symbol: '♕' },
            'e1': { type: 'king', color: 'white', symbol: '♔' },
            'f1': { type: 'bishop', color: 'white', symbol: '♗' },
            'g1': { type: 'knight', color: 'white', symbol: '♘' },
            'h1': { type: 'rook', color: 'white', symbol: '♖' },
            
            // White pawns
            'a2': { type: 'pawn', color: 'white', symbol: '♙' },
            'b2': { type: 'pawn', color: 'white', symbol: '♙' },
            'c2': { type: 'pawn', color: 'white', symbol: '♙' },
            'd2': { type: 'pawn', color: 'white', symbol: '♙' },
            'e2': { type: 'pawn', color: 'white', symbol: '♙' },
            'f2': { type: 'pawn', color: 'white', symbol: '♙' },
            'g2': { type: 'pawn', color: 'white', symbol: '♙' },
            'h2': { type: 'pawn', color: 'white', symbol: '♙' },
            
            // Black pieces
            'a8': { type: 'rook', color: 'black', symbol: '♜' },
            'b8': { type: 'knight', color: 'black', symbol: '♞' },
            'c8': { type: 'bishop', color: 'black', symbol: '♝' },
            'd8': { type: 'queen', color: 'black', symbol: '♛' },
            'e8': { type: 'king', color: 'black', symbol: '♚' },
            'f8': { type: 'bishop', color: 'black', symbol: '♝' },
            'g8': { type: 'knight', color: 'black', symbol: '♞' },
            'h8': { type: 'rook', color: 'black', symbol: '♜' },
            
            // Black pawns
            'a7': { type: 'pawn', color: 'black', symbol: '♟' },
            'b7': { type: 'pawn', color: 'black', symbol: '♟' },
            'c7': { type: 'pawn', color: 'black', symbol: '♟' },
            'd7': { type: 'pawn', color: 'black', symbol: '♟' },
            'e7': { type: 'pawn', color: 'black', symbol: '♟' },
            'f7': { type: 'pawn', color: 'black', symbol: '♟' },
            'g7': { type: 'pawn', color: 'black', symbol: '♟' },
            'h7': { type: 'pawn', color: 'black', symbol: '♟' }
        };
        
        // Place pieces on board
        for (const [square, piece] of Object.entries(pieces)) {
            const [file, rank] = this.parseSquare(square);
            board[rank][file] = piece;
        }
        
        return board;
    }

    parseSquare(square) {
        const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
        const rank = parseInt(square[1]) - 1; // 1=0, 2=1, etc.
        return [file, rank];
    }

    squareToString(file, rank) {
        return String.fromCharCode(97 + file) + (rank + 1);
    }

    getPiece(square) {
        const [file, rank] = this.parseSquare(square);
        return this.board[rank][file];
    }

    setPiece(square, piece) {
        const [file, rank] = this.parseSquare(square);
        this.board[rank][file] = piece;
    }

    isValidSquare(file, rank) {
        return file >= 0 && file < 8 && rank >= 0 && rank < 8;
    }

    isSquareEmpty(square) {
        return this.getPiece(square) === null;
    }

    isSquareOccupiedByOpponent(square, color) {
        const piece = this.getPiece(square);
        return piece !== null && piece.color !== color;
    }

    getValidMoves(square) {
        const piece = this.getPiece(square);
        if (!piece || piece.color !== this.currentPlayer) {
            return [];
        }

        const moves = this.generatePieceMoves(square, piece);
        
        // Filter out moves that would leave the king in check
        return moves.filter(move => !this.wouldLeaveKingInCheck(square, move));
    }

    generatePieceMoves(square, piece, includeCastling = true) {
        const [file, rank] = this.parseSquare(square);
        const moves = [];

        switch (piece.type) {
            case 'pawn':
                moves.push(...this.getPawnMoves(file, rank, piece.color));
                break;
            case 'rook':
                moves.push(...this.getRookMoves(file, rank, piece.color));
                break;
            case 'knight':
                moves.push(...this.getKnightMoves(file, rank, piece.color));
                break;
            case 'bishop':
                moves.push(...this.getBishopMoves(file, rank, piece.color));
                break;
            case 'queen':
                moves.push(...this.getQueenMoves(file, rank, piece.color));
                break;
            case 'king':
                moves.push(...this.getKingMoves(file, rank, piece.color, includeCastling));
                break;
        }

        return moves;
    }

    getPawnMoves(file, rank, color) {
        const moves = [];
        const direction = color === 'white' ? 1 : -1;
        const startRank = color === 'white' ? 1 : 6;

        // Forward move
        if (this.isValidSquare(file, rank + direction)) {
            const forwardSquare = this.squareToString(file, rank + direction);
            if (this.isSquareEmpty(forwardSquare)) {
                moves.push(forwardSquare);

                // Double move from starting position
                if (rank === startRank && this.isValidSquare(file, rank + 2 * direction)) {
                    const doubleSquare = this.squareToString(file, rank + 2 * direction);
                    if (this.isSquareEmpty(doubleSquare)) {
                        moves.push(doubleSquare);
                    }
                }
            }
        }

        // Captures
        for (const captureFile of [file - 1, file + 1]) {
            if (this.isValidSquare(captureFile, rank + direction)) {
                const captureSquare = this.squareToString(captureFile, rank + direction);
                if (this.isSquareOccupiedByOpponent(captureSquare, color)) {
                    moves.push(captureSquare);
                }
                
                // En passant
                if (this.enPassantTarget === captureSquare) {
                    moves.push(captureSquare);
                }
            }
        }

        return moves;
    }

    getRookMoves(file, rank, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [df, dr] of directions) {
            for (let i = 1; i < 8; i++) {
                const newFile = file + df * i;
                const newRank = rank + dr * i;

                if (!this.isValidSquare(newFile, newRank)) break;

                const square = this.squareToString(newFile, newRank);
                
                if (this.isSquareEmpty(square)) {
                    moves.push(square);
                } else {
                    if (this.isSquareOccupiedByOpponent(square, color)) {
                        moves.push(square);
                    }
                    break;
                }
            }
        }

        return moves;
    }

    getKnightMoves(file, rank, color) {
        const moves = [];
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];

        for (const [df, dr] of knightMoves) {
            const newFile = file + df;
            const newRank = rank + dr;

            if (this.isValidSquare(newFile, newRank)) {
                const square = this.squareToString(newFile, newRank);
                if (this.isSquareEmpty(square) || this.isSquareOccupiedByOpponent(square, color)) {
                    moves.push(square);
                }
            }
        }

        return moves;
    }

    getBishopMoves(file, rank, color) {
        const moves = [];
        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

        for (const [df, dr] of directions) {
            for (let i = 1; i < 8; i++) {
                const newFile = file + df * i;
                const newRank = rank + dr * i;

                if (!this.isValidSquare(newFile, newRank)) break;

                const square = this.squareToString(newFile, newRank);
                
                if (this.isSquareEmpty(square)) {
                    moves.push(square);
                } else {
                    if (this.isSquareOccupiedByOpponent(square, color)) {
                        moves.push(square);
                    }
                    break;
                }
            }
        }

        return moves;
    }

    getQueenMoves(file, rank, color) {
        return [
            ...this.getRookMoves(file, rank, color),
            ...this.getBishopMoves(file, rank, color)
        ];
    }

    getKingMoves(file, rank, color, includeCastling = true) {
        const moves = [];
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (const [df, dr] of directions) {
            const newFile = file + df;
            const newRank = rank + dr;

            if (this.isValidSquare(newFile, newRank)) {
                const square = this.squareToString(newFile, newRank);
                if (this.isSquareEmpty(square) || this.isSquareOccupiedByOpponent(square, color)) {
                    moves.push(square);
                }
            }
        }

        // Only include castling if explicitly requested (avoid circular dependency)
        if (includeCastling) {
            if (this.canCastle(color, 'kingside')) {
                moves.push(this.squareToString(file + 2, rank));
            }
            if (this.canCastle(color, 'queenside')) {
                moves.push(this.squareToString(file - 2, rank));
            }
        }

        return moves;
    }

    canCastle(color, side) {
        const rank = color === 'white' ? 0 : 7;
        const kingFile = 4;
        
        // Check castling rights
        if (!this.castlingRights[color][side]) return false;
        
        // Check if king is in check (use non-castling moves to avoid circular dependency)
        if (this.isKingInCheckNoCastling(color)) return false;
        
        // Check if squares between king and rook are empty
        const rookFile = side === 'kingside' ? 7 : 0;
        const direction = side === 'kingside' ? 1 : -1;
        const squares = side === 'kingside' ? 2 : 3;
        
        for (let i = 1; i <= squares; i++) {
            const file = kingFile + direction * i;
            if (!this.isSquareEmpty(this.squareToString(file, rank))) {
                return false;
            }
            
            // Check if king would pass through check (for kingside and queenside)
            if (i <= 2) {
                if (this.isSquareAttackedNoCastling(this.squareToString(file, rank), color === 'white' ? 'black' : 'white')) {
                    return false;
                }
            }
        }
        
        return true;
    }

    makeMove(fromSquare, toSquare) {
        const piece = this.getPiece(fromSquare);
        if (!piece) {
            throw new Error('No piece at source square');
        }

        // Validate that it's the correct player's turn
        if (piece.color !== this.currentPlayer) {
            throw new Error(`It's ${this.currentPlayer}'s turn`);
        }

        // Validate that the move is legal
        const validMoves = this.getValidMoves(fromSquare);
        if (!validMoves.includes(toSquare)) {
            throw new Error('Invalid move');
        }

        const capturedPiece = this.getPiece(toSquare);
        const [fromFile, fromRank] = this.parseSquare(fromSquare);
        const [toFile, toRank] = this.parseSquare(toSquare);

        // Create move object
        const move = {
            from: fromSquare,
            to: toSquare,
            piece: piece,
            captured: capturedPiece,
            notation: this.generateMoveNotation(fromSquare, toSquare, piece, capturedPiece),
            enPassantTarget: this.enPassantTarget,
            castlingRights: JSON.parse(JSON.stringify(this.castlingRights))
        };

        // Handle special moves
        this.handleSpecialMoves(move, piece, fromFile, fromRank, toFile, toRank);

        // Make the move
        this.setPiece(toSquare, piece);
        this.setPiece(fromSquare, null);

        // Switch players BEFORE checking game state
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        
        if (this.currentPlayer === 'white') {
            this.fullmoveNumber++;
        }

        // Update game state AFTER switching players
        this.updateGameState(move);
        
        // Add to move history
        this.moveHistory.push(move);

        return move;
    }

    handleSpecialMoves(move, piece, fromFile, fromRank, toFile, toRank) {
        // En passant capture
        if (piece.type === 'pawn' && this.enPassantTarget === move.to) {
            const capturedPawnRank = piece.color === 'white' ? toRank - 1 : toRank + 1;
            const capturedPawnSquare = this.squareToString(toFile, capturedPawnRank);
            move.enPassantCapture = this.getPiece(capturedPawnSquare);
            this.setPiece(capturedPawnSquare, null);
        }

        // Pawn double move - set en passant target
        if (piece.type === 'pawn' && Math.abs(toRank - fromRank) === 2) {
            const enPassantRank = piece.color === 'white' ? fromRank + 1 : fromRank - 1;
            this.enPassantTarget = this.squareToString(fromFile, enPassantRank);
        } else {
            this.enPassantTarget = null;
        }

        // Castling
        if (piece.type === 'king' && Math.abs(toFile - fromFile) === 2) {
            const rookFromFile = toFile > fromFile ? 7 : 0;
            const rookToFile = toFile > fromFile ? 5 : 3;
            const rook = this.getPiece(this.squareToString(rookFromFile, fromRank));
            
            this.setPiece(this.squareToString(rookToFile, fromRank), rook);
            this.setPiece(this.squareToString(rookFromFile, fromRank), null);
            
            move.castling = toFile > fromFile ? 'kingside' : 'queenside';
        }

        // Update castling rights
        if (piece.type === 'king') {
            this.castlingRights[piece.color].kingside = false;
            this.castlingRights[piece.color].queenside = false;
        } else if (piece.type === 'rook') {
            if (fromFile === 0) {
                this.castlingRights[piece.color].queenside = false;
            } else if (fromFile === 7) {
                this.castlingRights[piece.color].kingside = false;
            }
        }

        // Pawn promotion (simplified - always promote to queen)
        if (piece.type === 'pawn' && (toRank === 0 || toRank === 7)) {
            const promotedPiece = {
                type: 'queen',
                color: piece.color,
                symbol: piece.color === 'white' ? '♕' : '♛'
            };
            this.setPiece(move.to, promotedPiece);
            move.promotion = 'queen';
        }
    }

    updateGameState(move) {
        // Update halfmove clock
        if (move.piece.type === 'pawn' || move.captured) {
            this.halfmoveClock = 0;
        } else {
            this.halfmoveClock++;
        }

        // Check for game ending conditions for the current player (who just moved)
        this.updateGameEndingConditions();
    }

    updateGameEndingConditions() {
        const currentColor = this.currentPlayer;
        const inCheck = this.isKingInCheck(currentColor);
        const hasValidMoves = this.hasValidMovesForPlayer(currentColor);

        // Check for game ending conditions
        if (!hasValidMoves) {
            if (inCheck) {
                // No valid moves + in check = checkmate
                this.gameState = 'checkmate';
            } else {
                // No valid moves + not in check = stalemate
                this.gameState = 'stalemate';
            }
        } else if (this.halfmoveClock >= 100) {
            this.gameState = 'draw';
        } else if (inCheck) {
            // In check but has valid moves = check
            this.gameState = 'check';
        } else {
            this.gameState = 'playing';
        }
    }

    // Add method to manually set checkmate (called by LLM analysis)
    setCheckmate() {
        this.gameState = 'checkmate';
    }

    // Enhanced method to check if position is actually checkmate
    isActualCheckmate(color) {
        // First check if the king is in check
        const inCheck = this.isKingInCheck(color);
        if (!inCheck) {
            return false;
        }
        
        // Then check if there are any valid moves to get out of check
        // This includes king moves, blocking moves, and capturing the attacker
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === color) {
                    const square = this.squareToString(file, rank);
                    const validMoves = this.getValidMovesForSquare(square);
                    if (validMoves.length > 0) {
                        console.log(`Found escape move for ${color}: ${square} to ${validMoves[0]}`);
                        return false;  // Not checkmate if ANY piece has a valid move
                    }
                }
            }
        }
        
        console.log(`Confirmed checkmate for ${color}`);
        return true;
    }

    // Add method to get legal moves for any color (used by LLM analysis)
    getLegalMovesForColor(color) {
        const legalMoves = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === color) {
                    const square = this.squareToString(file, rank);
                    const moves = this.getValidMovesForSquare(square);
                    moves.forEach(move => {
                        const notation = this.generateMoveNotation(square, move, piece, this.getPiece(move));
                        legalMoves.push(notation);
                    });
                }
            }
        }
        
        return legalMoves.sort();
    }

    // Consolidate hasValidMoves methods
    hasValidMovesForPlayer(color) {
        // Check if the player has any legal moves that don't leave their king in check
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === color) {
                    const square = this.squareToString(file, rank);
                    const validMoves = this.getValidMovesForSquare(square);
                    if (validMoves.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    getValidMovesForSquare(square) {
        const piece = this.getPiece(square);
        if (!piece) return [];

        const moves = this.generatePieceMoves(square, piece);
        
        // Filter out moves that would leave the king in check
        return moves.filter(move => !this.wouldLeaveKingInCheck(square, move));
    }

    getValidMoves(square) {
        const piece = this.getPiece(square);
        if (!piece || piece.color !== this.currentPlayer) {
            return [];
        }

        return this.getValidMovesForSquare(square);
    }

    hasValidMoves(color) {
        return this.hasValidMovesForPlayer(color);
    }

    wouldLeaveKingInCheck(fromSquare, toSquare) {
        const piece = this.getPiece(fromSquare);
        if (!piece) return false;
        
        const capturedPiece = this.getPiece(toSquare);
        const [fromFile, fromRank] = this.parseSquare(fromSquare);
        const [toFile, toRank] = this.parseSquare(toSquare);
        
        // Handle en passant capture simulation
        let enPassantCaptureSquare = null;
        let enPassantCapturedPiece = null;
        
        if (piece.type === 'pawn' && this.enPassantTarget === toSquare) {
            const capturedPawnRank = piece.color === 'white' ? toRank - 1 : toRank + 1;
            enPassantCaptureSquare = this.squareToString(toFile, capturedPawnRank);
            enPassantCapturedPiece = this.getPiece(enPassantCaptureSquare);
        }
        
        // Handle castling simulation
        let rookFromSquare = null;
        let rookToSquare = null;
        let rook = null;
        
        if (piece.type === 'king' && Math.abs(toFile - fromFile) === 2) {
            const rookFromFile = toFile > fromFile ? 7 : 0;
            const rookToFile = toFile > fromFile ? 5 : 3;
            rookFromSquare = this.squareToString(rookFromFile, fromRank);
            rookToSquare = this.squareToString(rookToFile, fromRank);
            rook = this.getPiece(rookFromSquare);
        }
        
        // Make temporary move
        this.setPiece(toSquare, piece);
        this.setPiece(fromSquare, null);
        
        // Handle special move simulations
        if (enPassantCaptureSquare) {
            this.setPiece(enPassantCaptureSquare, null);
        }
        
        if (rookFromSquare && rookToSquare && rook) {
            this.setPiece(rookToSquare, rook);
            this.setPiece(rookFromSquare, null);
        }
        
        const inCheck = this.isKingInCheck(piece.color);
        
        // Undo temporary move
        this.setPiece(fromSquare, piece);
        this.setPiece(toSquare, capturedPiece);
        
        // Undo special moves
        if (enPassantCaptureSquare) {
            this.setPiece(enPassantCaptureSquare, enPassantCapturedPiece);
        }
        
        if (rookFromSquare && rookToSquare && rook) {
            this.setPiece(rookFromSquare, rook);
            this.setPiece(rookToSquare, null);
        }
        
        return inCheck;
    }

    isKingInCheck(color) {
        const kingSquare = this.findKing(color);
        if (!kingSquare) return false;
        
        const opponentColor = color === 'white' ? 'black' : 'white';
        return this.isSquareAttacked(kingSquare, opponentColor);
    }

    isKingInCheckNoCastling(color) {
        const kingSquare = this.findKing(color);
        if (!kingSquare) return false;
        
        const opponentColor = color === 'white' ? 'black' : 'white';
        return this.isSquareAttackedNoCastling(kingSquare, opponentColor);
    }

    findKing(color) {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.type === 'king' && piece.color === color) {
                    return this.squareToString(file, rank);
                }
            }
        }
        return null;
    }

    isSquareAttacked(square, byColor) {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === byColor) {
                    const attackerSquare = this.squareToString(file, rank);
                    // Generate attacking moves (without castling to avoid infinite recursion)
                    const moves = this.generatePieceMoves(attackerSquare, piece, false);
                    if (moves.includes(square)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    isSquareAttackedNoCastling(square, byColor) {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === byColor) {
                    const attackerSquare = this.squareToString(file, rank);
                    // Generate moves without castling to avoid circular dependency
                    const moves = this.generatePieceMoves(attackerSquare, piece, false);
                    if (moves.includes(square)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    cloneBoard() {
        return this.board.map(row => [...row]);
    }

    generateMoveNotation(fromSquare, toSquare, piece, capturedPiece) {
        let notation = '';
        
        if (piece.type === 'pawn') {
            if (capturedPiece) {
                notation = fromSquare[0] + 'x' + toSquare;
            } else {
                notation = toSquare;
            }
        } else {
            const pieceSymbol = piece.type === 'knight' ? 'N' : piece.type.charAt(0).toUpperCase();
            notation = pieceSymbol + (capturedPiece ? 'x' : '') + toSquare;
        }
        
        return notation;
    }

    getBoardAsFEN() {
        let fen = '';
        
        // Board position
        for (let rank = 7; rank >= 0; rank--) {
            let emptyCount = 0;
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece) {
                    if (emptyCount > 0) {
                        fen += emptyCount;
                        emptyCount = 0;
                    }
                    const symbol = this.pieceToFEN(piece);
                    fen += symbol;
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) {
                fen += emptyCount;
            }
            if (rank > 0) {
                fen += '/';
            }
        }
        
        // Active color
        fen += ' ' + (this.currentPlayer === 'white' ? 'w' : 'b');
        
        // Castling rights
        let castling = '';
        if (this.castlingRights.white.kingside) castling += 'K';
        if (this.castlingRights.white.queenside) castling += 'Q';
        if (this.castlingRights.black.kingside) castling += 'k';
        if (this.castlingRights.black.queenside) castling += 'q';
        fen += ' ' + (castling || '-');
        
        // En passant
        fen += ' ' + (this.enPassantTarget || '-');
        
        // Halfmove clock and fullmove number
        fen += ' ' + this.halfmoveClock + ' ' + this.fullmoveNumber;
        
        return fen;
    }

    pieceToFEN(piece) {
        const symbols = {
            'king': 'k', 'queen': 'q', 'rook': 'r',
            'bishop': 'b', 'knight': 'n', 'pawn': 'p'
        };
        const symbol = symbols[piece.type];
        return piece.color === 'white' ? symbol.toUpperCase() : symbol;
    }

    reset() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'white';
        this.moveHistory = [];
        this.gameState = 'playing';
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true }
        };
        this.halfmoveClock = 0;
        this.fullmoveNumber = 1;
    }

    // Enhanced position evaluation for better AI understanding
    getPositionEvaluation() {
        // Simple position evaluation based on material and piece activity
        const materialScore = this.getMaterialBalance();
        const pieceActivityScore = this.getPieceActivityScore();
        const centerControlScore = this.getCenterControlScore();
        const kingSafetyScore = this.getKingSafetyScore();
        
        return materialScore + pieceActivityScore + centerControlScore + kingSafetyScore;
    }

    getMaterialBalance() {
        const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
        let whiteTotal = 0, blackTotal = 0;
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.type !== 'king') {
                    const value = pieceValues[piece.type] || 0;
                    if (piece.color === 'white') {
                        whiteTotal += value;
                    } else {
                        blackTotal += value;
                    }
                }
            }
        }
        
        return { white: whiteTotal, black: blackTotal, difference: blackTotal - whiteTotal };
    }

    getKingSafetyScore() {
        const whiteKingSafety = this.evaluateKingSafety('white');
        const blackKingSafety = this.evaluateKingSafety('black');
        
        return {
            white: whiteKingSafety,
            black: blackKingSafety,
            advantage: blackKingSafety - whiteKingSafety
        };
    }

    evaluateKingSafety(color) {
        const kingSquare = this.findKing(color);
        if (!kingSquare) return -100; // King missing is very bad
        
        const [kingFile, kingRank] = this.parseSquare(kingSquare);
        let safety = 0;
        
        // Bonus for castled king
        const expectedRank = color === 'white' ? 0 : 7;
        if (kingRank === expectedRank) {
            if (kingFile === 6 || kingFile === 2) { // Castled position
                safety += 20;
            }
        }
        
        // Penalty for exposed king
        const opponentColor = color === 'white' ? 'black' : 'white';
        const attackedSquares = this.getSquaresAroundKing(kingSquare);
        let attackedCount = 0;
        
        for (const square of attackedSquares) {
            if (this.isSquareAttacked(square, opponentColor)) {
                attackedCount++;
            }
        }
        
        safety -= attackedCount * 5; // Penalty for attacked squares around king
        
        // Check for pawn shield
        const pawnShield = this.evaluatePawnShield(kingSquare, color);
        safety += pawnShield;
        
        return safety;
    }

    getSquaresAroundKing(kingSquare) {
        const [kingFile, kingRank] = this.parseSquare(kingSquare);
        const squares = [];
        
        for (let df = -1; df <= 1; df++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (df === 0 && dr === 0) continue; // Skip king's own square
                
                const newFile = kingFile + df;
                const newRank = kingRank + dr;
                
                if (this.isValidSquare(newFile, newRank)) {
                    squares.push(this.squareToString(newFile, newRank));
                }
            }
        }
        
        return squares;
    }

    evaluatePawnShield(kingSquare, color) {
        const [kingFile, kingRank] = this.parseSquare(kingSquare);
        const direction = color === 'white' ? 1 : -1;
        let shield = 0;
        
        // Check pawns in front of king
        for (let df = -1; df <= 1; df++) {
            const pawnFile = kingFile + df;
            const pawnRank = kingRank + direction;
            
            if (this.isValidSquare(pawnFile, pawnRank)) {
                const pawnSquare = this.squareToString(pawnFile, pawnRank);
                const piece = this.getPiece(pawnSquare);
                
                if (piece && piece.type === 'pawn' && piece.color === color) {
                    shield += 10; // Bonus for pawn shield
                }
            }
        }
        
        return shield;
    }

    getPieceActivityScore() {
        const whiteMobility = this.calculateMobility('white');
        const blackMobility = this.calculateMobility('black');
        
        return {
            white: whiteMobility,
            black: blackMobility,
            advantage: blackMobility - whiteMobility
        };
    }

    calculateMobility(color) {
        let totalMobility = 0;
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = this.board[rank][file];
                if (piece && piece.color === color && piece.type !== 'king') {
                    const square = this.squareToString(file, rank);
                    const moves = this.generatePieceMoves(square, piece, false);
                    
                    // Weight mobility by piece type
                    const mobilityWeight = {
                        pawn: 1, knight: 2, bishop: 2, rook: 1, queen: 0.5
                    };
                    
                    totalMobility += moves.length * (mobilityWeight[piece.type] || 1);
                }
            }
        }
        
        return totalMobility;
    }

    getCenterControlScore() {
        const centerSquares = ['d4', 'd5', 'e4', 'e5'];
        const extendedCenter = ['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6'];
        
        let whiteControl = 0, blackControl = 0;
        
        for (const square of centerSquares) {
            if (this.isSquareAttacked(square, 'white')) whiteControl += 2;
            if (this.isSquareAttacked(square, 'black')) blackControl += 2;
            
            const piece = this.getPiece(square);
            if (piece) {
                if (piece.color === 'white') whiteControl += 3;
                else blackControl += 3;
            }
        }
        
        for (const square of extendedCenter) {
            if (this.isSquareAttacked(square, 'white')) whiteControl += 1;
            if (this.isSquareAttacked(square, 'black')) blackControl += 1;
        }
        
        return {
            white: whiteControl,
            black: blackControl,
            advantage: blackControl - whiteControl
        };
    }
}
