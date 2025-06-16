class ChessUtils {
    static getLegalMovesForColor(engine, color) {
        const legalMoves = [];
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = engine.board[rank][file];
                if (piece && piece.color === color) {
                    const square = engine.squareToString(file, rank);
                    const moves = engine.getValidMoves(square);
                    moves.forEach(move => {
                        const notation = engine.generateMoveNotation(square, move, piece, engine.getPiece(move));
                        legalMoves.push(notation);
                    });
                }
            }
        }
        
        return legalMoves.sort();
    }

    static hasValidMovesForColor(engine, color) {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = engine.board[rank][file];
                if (piece && piece.color === color) {
                    const square = engine.squareToString(file, rank);
                    const validMoves = engine.getValidMoves(square);
                    if (validMoves.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static isGameOver(engine) {
        const hasValidMoves = ChessUtils.hasValidMovesForColor(engine, engine.currentPlayer);
        
        if (!hasValidMoves) {
            const inCheck = engine.isKingInCheck(engine.currentPlayer);
            
            if (inCheck) {
                engine.gameState = 'checkmate';
            } else {
                engine.gameState = 'stalemate';
            }
            
            return true;
        }
        
        return false;
    }
}

// Make it available globally
window.ChessUtils = ChessUtils;
