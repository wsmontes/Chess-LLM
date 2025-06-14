# Chess vs LLM

A beautiful web-based chess application that allows you to play chess against AI powered by either a local LLM (via LM Studio) or OpenAI's GPT models.

## Features

- 🎯 **Beautiful Modern UI** - Clean, responsive design with smooth animations
- ♟️ **Full Chess Implementation** - Complete chess rules including castling, en passant, and pawn promotion
- 🤖 **Multiple AI Providers** - Play against local LLM (LM Studio) or OpenAI GPT models
- 🎮 **Interactive Gameplay** - Drag & drop or click to move pieces
- 📊 **Move History** - Track all moves with algebraic notation
- 💡 **Hints System** - Get suggestions from the AI
- ⚙️ **Configurable Settings** - Adjust AI model, temperature, and provider
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices

## AI Provider Options

### Option 1: Local LLM via LM Studio (Free)
- Complete privacy - all processing happens locally
- Works offline once set up
- Requires downloading LM Studio and a compatible model

### Option 2: OpenAI GPT Models (Paid)
- Access to powerful GPT-3.5 Turbo and GPT-4 models
- No local setup required
- Requires OpenAI API key and usage fees apply

## Setup Instructions

### Option 1: LM Studio Setup

1. **Download LM Studio** - Get it from [LM Studio](https://lmstudio.ai/)
2. **Download a Compatible Model** - Try `google/gemma-2-9b-it` or similar chat model
3. **Start the Local Server**:
   - Go to the "Local Server" tab in LM Studio
   - Select your model
   - Click "Start Server"
   - Server should start on `http://localhost:1234`

### Option 2: OpenAI Setup

1. **Get an OpenAI API Key**:
   - Visit [OpenAI API](https://platform.openai.com/api-keys)
   - Create an account and generate an API key
   - Add billing information (usage fees apply)

2. **Configure in the App**:
   - Select "OpenAI GPT-3.5 Turbo" as provider
   - Enter your API key (stored locally in browser)
   - Choose your preferred model (GPT-3.5 Turbo recommended for cost/performance)

### Running the Chess Application

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

1. **Configure AI Provider**:
   - Choose between LM Studio (local) or OpenAI (cloud)
   - Configure the appropriate settings (model, API key, etc.)
   - Wait for the connection status to show "Connected"

2. **Start Playing**:
   - You play as White (bottom of the board)
   - Click a piece to select it, then click the destination square
   - Or drag and drop pieces to move them
   - The AI will automatically respond as Black

3. **Game Features**:
   - **New Game** - Start a fresh game
   - **Undo Move** - Take back your last move
   - **Get Hint** - Ask the AI for a move suggestion

## Configuration Options

### AI Provider Settings

**LM Studio (Local)**:
- **Model**: The model name loaded in LM Studio
- **Endpoint**: Usually `http://localhost:1234`

**OpenAI**:
- **API Key**: Your OpenAI API key (stored securely in browser)
- **Model**: Choose from GPT-3.5 Turbo, GPT-4, etc.

**Common Settings**:
- **Temperature**: Controls AI creativity (0.0 = deterministic, 1.0 = very creative)

### Cost Considerations

**LM Studio**: Free after initial setup, but requires:
- Powerful computer (8GB+ RAM recommended)
- Time to download models (several GB each)
- Slower response times on weaker hardware

**OpenAI**: Pay-per-use pricing:
- GPT-3.5 Turbo: ~$0.001-0.002 per game
- GPT-4: ~$0.03-0.06 per game
- Real-time usage tracking in OpenAI dashboard

## Troubleshooting

### LM Studio Issues
1. Ensure LM Studio is running with a model loaded
2. Check that the endpoint URL is correct
3. Verify the model name matches what's loaded in LM Studio

### OpenAI Issues
1. Verify your API key is correct and active
2. Check your OpenAI account has billing set up
3. Ensure you haven't exceeded rate limits or billing limits

### General Issues
1. Check browser console for error messages
2. Try refreshing the page
3. Clear browser cache and localStorage

## Technical Details

### Architecture
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Chess Engine**: Custom implementation with full rule validation
- **AI Integration**: Supports both local (LM Studio) and cloud (OpenAI) providers
- **UI Framework**: Pure CSS with modern design principles

### API Integration

**LM Studio** (OpenAI-compatible local API):
```javascript
POST http://localhost:1234/v1/chat/completions
```

**OpenAI**:
```javascript
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer YOUR_API_KEY
```

## Privacy and Security

- **LM Studio**: Complete privacy - all processing happens locally
- **OpenAI**: Chess moves and analysis are sent to OpenAI's servers
- **API Keys**: Stored locally in browser localStorage (never transmitted except to respective APIs)
- **No Data Collection**: This app doesn't collect or store any user data on external servers

## Contributing

Feel free to submit issues and enhancement requests! Some ideas for improvements:

- [ ] Support for other AI providers (Anthropic Claude, etc.)
- [ ] Advanced chess analysis features
- [ ] Tournament mode against multiple AI models
- [ ] Chess opening book integration
- [ ] Save/load games functionality

## License

This project is open source and available under the MIT License.

---

**Enjoy playing chess against AI!** 🏁♟️
