# HexiLexi

A vocabulary learning tool for German-speaking children ages 8–10, built as part of the Streen educational ecosystem.

[![Version](https://img.shields.io/badge/version-4.5-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/react-18.2-61dafb.svg)](https://reactjs.org)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](frontend/TEST_RESULTS.md)

## Overview

HexiLexi is an AI-powered vocabulary discovery component designed to help children learn German words through guided conversation. Rather than providing direct definitions, the app engages kids in interactive dialogues that help them discover word meanings on their own.

**Key Features:**
- Four distinct learning modes with varying difficulty and reward structures
- Context-aware conversations that reference the surrounding story
- Gamification through points, levels, and achievements
- Voice input support for hands-free interaction
- Cookie-based progress persistence

## Architecture

HexiLexi runs entirely in the browser, no backend server required. The frontend communicates directly with an LLM API for generating conversational responses.

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌────────────────┐   ┌────────────────┐                │
│  │    App.js      │──▶│  llmService.js │──▶ LLM API    │
│  │  (React + UI)  │   │  (Rate-limited)│                │
│  └────────────────┘   └────────────────┘                │
│          │                                              │
│          ▼                                              │
│  ┌────────────────┐                                     │
│  │   config.js    │  Prompts, modes, settings           │
│  └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

## Learning Modes

| Mode | Icon | Description | Points |
|------|------|-------------|--------|
| **Erklären** | 📖 | Direct explanation with option to ask for more | 2 |
| **Entdecken** | 🔍 | 3-phase scaffolded discovery: Context → Narrowing → Meaning confirmation (8 turns max) | 10 |
| **Synonym** | 🪞 | Identify meaning through similar words | 5 |
| **Wort-Teile** | 🧩 | Break down compound words into components | 8 |

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | React 18.2, Create React App |
| **UI Library** | Ant Design 5.9 |
| **HTTP Client** | Axios 1.12 |
| **Voice Input** | Web Speech API |
| **AI Model** | Gemma 3:12B via LLaMA API |

## Getting Started

### Prerequisites

- Node.js 14.0 or higher
- npm 6.0 or higher
- Modern browser (Chrome 90+, Edge 90+, Safari 14+, Firefox 88+)

### Installation

```bash
# Clone the repository
git clone https://git.ais-lab.eu/streen/streen-worddetective.git
cd streen-worddetective

# Install dependencies
cd frontend
npm install

# Start development server
npm start
```

The app opens at `http://localhost:3000` with a default German sentence for testing.

### Production Build

```bash
cd frontend
npm run build
```

Output is generated in `frontend/build/`.

## Configuration

Core settings are in `frontend/src/config.js`:

```javascript
export const config = {
  ai: {
    chatUrl: "https://llm.ais-lab.eu/chat",
    model: "gemma3:12b",
    temperature: 0.2,
    maxTokens: 150,
    timeout: 15000
  },
  rateLimiting: {
    maxRequestsPerMinute: 25,
    queueMaxSize: 3,
    timeoutLimit: 45000
  }
};
```

### Feature Flags

```javascript
features: {
  enableSpeechInput: true,     // Voice input toggle
  showDeveloperOptions: false  // Dev tools visibility
}
```

## Project Structure

```
streen-worddetective/
├── frontend/
│   ├── src/
│   │   ├── App.js           # Main component and state
│   │   ├── App.css          # Styles and animations
│   │   ├── config.js        # Settings and AI prompts
│   │   ├── llmService.js    # LLM API integration
│   │   ├── stories.js       # Test data
│   │   └── assets/          # Media files
│   ├── public/
│   │   └── index.html
│   └── package.json
├── .github/
│   └── copilot-instructions.md
├── README.md
├── INTEGRATION_GUIDE.md
├── DEMO_CONVO.md
└── FUTURE_FEATURES.md
```

## Integration

HexiLexi is designed to embed into the Streen webapp as a modal component:

```jsx
<HexiLexi 
  isLexi={true}
  setIsLexi={setIsLexi}
  lexiSentence={{ text: "Die Hexe braut einen Zaubertrank." }}
  contextSentences={[]}
  initialLanguage="de"
/>
```

See [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) for complete integration instructions.

## Security

- **Input Sanitization**: All user input is stripped of HTML and scripts
- **Prompt Injection Protection**: Security prefix prevents AI manipulation
- **Rate Limiting**: Request queue with per-minute caps
- **Credential Handling**: API credentials are project-internal; never exposed in logs

## Documentation

| Document | Purpose |
|----------|---------|
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | Embedding HexiLexi in parent apps |
| [DEMO_CONVO.md](DEMO_CONVO.md) | Example conversations for prompt tuning |
| [FUTURE_FEATURES.md](FUTURE_FEATURES.md) | Planned enhancements |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | AI contributor reference |

## Browser Support

| Browser | Minimum Version | Voice Input |
|---------|-----------------|-------------|
| Chrome | 90+ | ✅ Full |
| Edge | 90+ | ✅ Full |
| Safari | 14+ | ✅ Full |
| Firefox | 88+ | ⚠️ Limited |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit changes (`git commit -m "Add: your feature"`)
4. Push to branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please review [copilot-instructions.md](.github/copilot-instructions.md) for coding conventions.

## License

ISC License

## Acknowledgments

- **Gemma 3:12B** — Language model by Google
- **LLaMA API** — AI infrastructure by AIS Lab
- **Ant Design** — React component library
- **Create React App** — React tooling

---

*HexiLexi — helping young learners discover the magic of words.*
