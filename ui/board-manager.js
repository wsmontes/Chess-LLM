class BoardManager {
    constructor(engine) {
        this.engine = engine;
        this.boardElement = document.getElementById('chess-board');
        this.selectedSquare = null;
        this.possibleMoves = [];
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
            square.classList.remove('selected', 'possible-move', 'last-move', 'check');
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

        // Highlight king in check
        if (this.engine.gameState === 'check') {
            const kingSquare = this.engine.findKing(this.engine.currentPlayer);
            this.highlightCheck(kingSquare);
        }
    }

    highlightCheck(kingSquare) {
        if (!kingSquare) return;
        
        const kingElement = this.boardElement.querySelector(`[data-square="${kingSquare}"]`);
        if (kingElement) {
            kingElement.classList.add('check');
        }
    }

    updateDisplay() {
        this.initializeBoard();
        this.updateBoardHighlights();
    }
}
