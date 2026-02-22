# HexiLexi AI Agent Reference

> A German vocabulary learning component for children ages 8–10. Part of the Streen ecosystem.

---

## Quick Reference

| Item | Value |
|------|-------|
| **Stack** | React 18 + Ant Design 5 + Axios |
| **Entry** | `frontend/src/App.js` |
| **Config** | `frontend/src/config.js` |
| **LLM Service** | `frontend/src/llmService.js` |
| **Styles** | `frontend/src/App.css` |
| **Dev Server** | `cd frontend && npm start` |
| **Build** | `cd frontend && npm run build` |

---

## 1. Architecture Overview

HexiLexi is a **frontend-only** React application that calls an external LLM API directly—no backend server required.

```
┌─────────────────────────────────────────────────────────────┐
│  Streen Webapp (Parent)                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  HexiLexi Component (Modal)                            │ │
│  │  ┌──────────────┐    ┌──────────────┐                  │ │
│  │  │   App.js     │───▶│ llmService   │──▶ LLM API      │ │
│  │  │   (UI/State) │    │ (API Layer)  │                  │ │
│  │  └──────────────┘    └──────────────┘                  │ │
│  │         │                                               │ │
│  │         ▼                                               │ │
│  │  ┌──────────────┐                                       │ │
│  │  │  config.js   │  (Prompts, Settings, Mode Config)    │ │
│  │  └──────────────┘                                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Integration Model
The component accepts props from a parent app for seamless embedding:
- `isLexi` / `setIsLexi` — visibility control
- `lexiSentence` — sentence object with `.text` property
- `contextSentences` — surrounding story sentences for richer AI context
- `initialLanguage` — language code (default: `"de"`)

See [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) for implementation details.

---

## 2. Core Files

| File | Purpose |
|------|---------|
| `App.js` | Main component: state management, UI rendering, conversation flow, gamification |
| `config.js` | LLM settings, mode definitions, AI prompts (Architect + Builder pattern), security prefix |
| `llmService.js` | API wrapper, rate limiting (`RequestManager`), answer evaluation, mode-specific conversation functions |
| `App.css` | All styling: theme, animations, responsive layout |
| `stories.js` | Test stories for development |

---

## 3. Conversation Modes

Four distinct learning modes, each with different pedagogy:

| Mode | Key | Icon | Type | Points | Max Turns |
|------|-----|------|------|--------|-----------|
| **Erklären** | 1 | 📖 | `direct` | 2 | 3 |
| **Entdecken** | 2 | 🔍 | `discovery` | 10 | 8 |
| **Synonym** | 3 | 🪞 | `synonym` | 5 | 3 |
| **Wort-Teile** | 4 | 🧩 | `composite` | 8 | 8 |

### Mode Behaviors
- **Erklären**: Immediate, direct explanation. Kid can ask "Erkläre mehr" for examples.
- **Entdecken**: 3-phase guided discovery using context building (Phase 1), narrowing questions (Phase 2), and meaning confirmation (Phase 3). MCQ-based throughout.
- **Synonym**: Shows similar words, asks kid to identify the meaning via MCQ.
- **Wort-Teile**: Two-phase decomposition of compound words (find parts → understand combined meaning). Only activates for detected composite words.

---

## 4. AI Prompt Architecture

HexiLexi uses an **Architect & Builder** pattern:

### Architect (`architectPrompt`)
- Runs once per word selection
- Analyzes the word and outputs structured JSON
- Provides: `bedeutung`, `hinweis1`, `hinweis2`, `richtig_kurz`, `falsch1`, `falsch2`, `synonyme`, `ist_kompositum`, `teile`, `wortart`, `kontext_elemente`, `discovery_fragen`, etc.

### Builder (`builderPrompts`)
- Mode-specific prompts that consume the Architect's analysis
- Handles presentation to the child
- Organized by mode: `erklaeren`, `entdecken`, `synonym`, `wortTeile`

### Security
All prompts include `securityPrefix` to prevent prompt injection. The AI stays in character and rejects manipulation attempts.

---

## 5. Key Functions

### llmService.js

| Function | Purpose |
|----------|---------|
| `analyzeWord(word, sentence)` | Architect call—returns JSON analysis |
| `startConversation(word, context, lang, mode)` | Initiates conversation, returns first question + analysis |
| `continueConversation(...)` | Processes user answer, returns feedback/next question |
| `detectWordTypes(words)` | Identifies composite words for Mode 4 filtering |
| `evaluateAnswer(userAnswer, correctAnswer, alternatives)` | Frontend-based answer validation with fuzzy matching |
| `explainMore(word, sentence, analysis, history)` | Mode 1 follow-up explanations |

### App.js

| Function | Purpose |
|----------|---------|
| `handleClickWordConversation(word)` | Starts conversation when kid clicks a word |
| `handleSubmitAnswer()` | Processes typed answers |
| `handleOptionClick(option)` | Processes MCQ button clicks |
| `addPoints(word, definition, points)` | Awards points, updates level, triggers confetti |

### RequestManager (llmService.js)
Rate limiting class that prevents server overload:
- 25 requests/minute cap
- Request queue (max 3 pending)
- 45-second timeout
- AbortController for cancellation

---

## 6. State Management

Key state variables in `App.js`:

| State | Type | Purpose |
|-------|------|---------|
| `mode` | number | Active conversation mode (1–4) |
| `word` | string | Currently selected word |
| `turn` | number | Current conversation turn |
| `conversationThread` | array | UI-rendered messages |
| `conversationHistory` | array | LLM message history |
| `wordAnalysis` | object | Cached Architect analysis |
| `compositeState` | object | Phase tracking for Mode 4 |
| `loading` | boolean | Blocks UI during API calls |
| `points` / `level` / `streak` | number | Gamification (persisted in cookies) |
| `learnedWords` | array | Dictionary of learned words |

---

## 7. UI Components

| Component | Description |
|-----------|-------------|
| `SkeletonLoader` | Animated loading placeholder (typing dots) |
| `HexiMessage` | Typewriter effect message with MCQ options |
| `ErrorBoundary` | Graceful error handling wrapper |

### Theme Elements
- **Colors**: Purple (`#9c27b0`) primary, golden accents
- **Avatar**: Animated witch video (`Witch1.webm`)
- **Kid Avatar**: Black cat emoji (🐈‍⬛)
- **Bubbles**: Comic-style speech bubbles (yellow for HexiLexi, blue for kid)
- **Cursor**: Magic wand throughout the app

---

## 8. Data Flow

```
Kid clicks word
      │
      ▼
handleClickWordConversation()
      │
      ├─▶ analyzeWord() ──▶ Architect JSON
      │
      ▼
startConversation() ──▶ Builder prompt ──▶ LLM
      │
      ▼
First question displayed with MCQ options
      │
      ▼
Kid answers (click option or type)
      │
      ▼
continueConversation()
      │
      ├─▶ evaluateAnswer() (frontend)
      │
      ▼
Builder follow-up prompt ──▶ LLM
      │
      ▼
Feedback displayed
      │
      ▼
Loop until done=true
      │
      ▼
addPoints() ──▶ Update cookies ──▶ Confetti if level up
```

---

## 9. Persistence

Cookie-based storage for cross-session persistence:

| Cookie | Purpose |
|--------|---------|
| `hexilexi_points` | Total earned points |
| `hexilexi_level` | Current level (1–10) |
| `hexilexi_streak` | Consecutive correct answers |
| `hexilexi_learned_words` | JSON array of word objects |
| `hexilexi_username` | Display name |

Helper functions: `setCookie()`, `getCookie()` in App.js.

---

## 10. Security Measures

| Measure | Implementation |
|---------|----------------|
| Input sanitization | `sanitizeInput()` removes HTML/scripts, limits length |
| Prompt injection protection | `securityPrefix` in all prompts |
| Rate limiting | `RequestManager` class |
| Response validation | Frontend-based answer evaluation |

---

## 11. Development Guidelines

### Commands
```bash
cd frontend
npm install          # Install dependencies
npm start            # Dev server at localhost:3000
npm run build        # Production build
node comprehensive_test.js  # Run prompt tests
```

### Testing Workflow
1. Start dev server
2. App loads with default German sentence
3. Select a mode from the mode selector
4. Click any highlighted word to start conversation
5. Answer via MCQ buttons or text input

### Code Conventions
- German UI strings in `getTranslations()` object
- Comments explaining non-obvious logic
- Keep `HexiMessage` outside render loops (prevents re-typing)
- Use `config.conversation.modes[n]` for mode settings
- Avoid creating new files unless necessary

---

## 12. Documentation Responsibilities

When making changes, update relevant documentation:

| Change Type | Update |
|-------------|--------|
| New feature | README.md, FUTURE_FEATURES.md |
| Prompt changes | DEMO_CONVO.md |
| Integration changes | INTEGRATION_GUIDE.md |
| Architecture changes | This file |

---

## 13. Working Protocol

### Before Implementation
1. Review relevant source files
2. Understand the existing flow
3. Present a plan with clear steps
4. Wait for approval on non-trivial changes

### During Implementation
1. Work through one task at a time
2. Add clear comments explaining changes
3. Preserve existing functionality
4. Test after each significant change

### After Implementation
1. Check for errors in terminal and Problems panel
2. Verify the app runs without issues
3. Update documentation if needed
4. Confirm with user before closing

### Response Structure
For complex tasks, organize your response:
- **A. Roadmap** — Problem analysis and approach
- **B. To-Do List** — Actionable steps
- **C. Implementation** — Code changes with explanations
- **D. Verification** — Error checks and testing
- **E. Follow-up** — Suggestions for improvement

---

## 14. Important Constraints

- **Never log or expose API credentials** (hardcoded in config.js)
- **Keep integration props functional** — the component must work as a modal in Streen
- **Maintain German as primary language** — English is for development only
- **Preserve the witchy theme** — purple colors, magical elements, playful tone
- **Keep responses brief** — kids lose interest with long text
- **MCQ options should include**: one correct, one close distractor, one obviously wrong/funny

---

## 15. Reference Files

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview and setup |
| [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) | Embedding instructions |
| [DEMO_CONVO.md](../DEMO_CONVO.md) | Example conversations for prompt tuning |
| [FUTURE_FEATURES.md](../FUTURE_FEATURES.md) | Planned enhancements |
