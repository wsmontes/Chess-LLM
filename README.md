# Chess vs LLM

A beautiful web-based chess application that allows you to play chess against a local LLM powered by LM Studio.

## Features

- 🎯 **Beautiful Modern UI** - Clean, responsive design with smooth animations
- ♟️ **Full Chess Implementation** - Complete chess rules including castling, en passant, and pawn promotion
- 🤖 **LLM Integration** - Play against AI powered by your local LM Studio instance
- 🎮 **Interactive Gameplay** - Drag & drop or click to move pieces
- 📊 **Move History** - Track all moves with algebraic notation
- 💡 **Hints System** - Get suggestions from the LLM
- ⚙️ **Configurable Settings** - Adjust LLM model, temperature, and endpoint
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices

## Prerequisites

1. **LM Studio** - Download and install [LM Studio](https://lmstudio.ai/)
2. **A Compatible Model** - Download a chat model (e.g., Gemma, Llama, etc.)
3. **Web Server** - Any local web server to serve the HTML files

## Setup Instructions

### 1. Set up LM Studio

1. Download and install LM Studio
2. Download a compatible chat model (recommended: `google/gemma-2-9b-it` or similar)
3. Start the local server in LM Studio:
   - Go to the "Local Server" tab
   - Select your model
   - Click "Start Server"
   - The server should start on `http://localhost:1234`

### 2. Run the Chess Application

#### Option A: Using Python's built-in server
```bash
# Navigate to the chess application directory
cd /path/to/Chess-LLM

# Start a simple HTTP server
python3 -m http.server 8000

# Open your browser and go to:
# http://localhost:8000
```

#### Option B: Using Node.js serve
```bash
# Install serve globally
npm install -g serve

# Navigate to the chess application directory
cd /path/to/Chess-LLM

# Start the server
serve -p 8000

# Open your browser and go to:
# http://localhost:8000
```

#### Option C: Using VS Code Live Server
1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

## How to Play

1. **Start the Game** - The application loads with a new chess game
2. **Make Your Move** - You play as White (bottom of the board)
   - Click a piece to select it, then click the destination square
   - Or drag and drop pieces to move them
3. **LLM Response** - The LLM will automatically make a move as Black
4. **Game Features**:
   - **New Game** - Start a fresh game
   - **Undo Move** - Take back your last move
   - **Get Hint** - Ask the LLM for a move suggestion

## Configuration

### LLM Settings

- **Model**: The model name in LM Studio (e.g., `google/gemma-2-9b-it`)
- **Temperature**: Controls randomness (0.0 = deterministic, 1.0 = very random)
- **Endpoint**: LM Studio server URL (usually `http://localhost:1234`)

### Connection Status

The application shows the connection status to LM Studio:
- 🟢 **Connected** - Ready to play
- 🔴 **Connection Failed** - Check if LM Studio is running

## Troubleshooting

### LLM Not Responding
1. Ensure LM Studio is running with a model loaded
2. Check that the endpoint URL is correct
3. Verify the model name matches what's loaded in LM Studio
4. Check browser console for error messages

### Chess Moves Not Working
1. Make sure it's your turn (White moves first)
2. Verify you're selecting valid pieces and moves
3. Check if the game has ended (checkmate, stalemate, etc.)

### Performance Issues
1. Try a smaller/faster model in LM Studio
2. Reduce the temperature setting
3. Close other applications to free up system resources

## Technical Details

### Architecture
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Chess Engine**: Custom implementation with full rule validation
- **LLM Client**: REST API integration with LM Studio
- **UI Framework**: Pure CSS with modern design principles

### Files Structure
- `index.html` - Main application HTML
- `styles.css` - All styling and responsive design
- `chess-engine.js` - Core chess game logic and rules
- `llm-client.js` - LM Studio API integration
- `chess-ui.js` - User interface and interaction handling
- `main.js` - Application initialization and error handling

### API Integration
The application communicates with LM Studio using the OpenAI-compatible API:
```javascript
POST http://localhost:1234/v1/chat/completions
{
  "model": "your-model-name",
  "messages": [
    {"role": "system", "content": "You are a chess engine..."},
    {"role": "user", "content": "Current position: ..."}
  ],
  "temperature": 0.3
}
```

## Customization

### Changing the Chess Board Theme
Edit the CSS variables in `styles.css`:
```css
:root {
    --light-square: #f0d9b5;  /* Light squares */
    --dark-square: #b58863;   /* Dark squares */
    --accent-color: #4CAF50;  /* Highlight color */
}
```

### Modifying LLM Prompts
Edit the system prompts in `llm-client.js` to change how the LLM plays:
```javascript
buildSystemPrompt() {
    return `You are a chess grandmaster... [custom instructions]`;
}
```

## Contributing

Feel free to submit issues and enhancement requests! Some ideas for improvements:

- [ ] Different difficulty levels
- [ ] Game analysis and evaluation
- [ ] Opening book integration
- [ ] Save/load games
- [ ] Multiple LLM providers
- [ ] Tournament mode

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Chess piece Unicode symbols
- Font Awesome icons
- Google Fonts (Inter)
- LM Studio for local LLM hosting

---

**Enjoy playing chess against your local LLM!** 🏁♟️
