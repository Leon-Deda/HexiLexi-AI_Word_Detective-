# HexiLexi Integration Guide

This document covers embedding HexiLexi into parent applications. HexiLexi is designed as a self-contained popup component that manages its own state while accepting configuration from the host app.

---

## Table of Contents

1. [React Integration](#react-integration)
2. [Props Reference](#props-reference)
3. [Learning Modes](#learning-modes)
4. [Configuration Options](#configuration-options)
5. [User Flow](#user-flow)
6. [Alternative Integration Methods](#alternative-integration-methods)
7. [API Requirements](#api-requirements)
8. [Persistence](#persistence)
9. [UI Behavior](#ui-behavior)

---

## React Integration

### Basic Setup

```jsx
import HexiLexi from './path/to/HexiLexi/App';

function StoryReader() {
  const [isLexi, setIsLexi] = useState(false);
  const [lexiSentence, setLexiSentence] = useState(null);
  const [contextSentences, setContextSentences] = useState([]);

  const handleOpenHexiLexi = (sentence, context) => {
    setLexiSentence(sentence);
    setContextSentences(context || []);
    setIsLexi(true);
  };

  return (
    <>
      <Story onHexiLexiClick={handleOpenHexiLexi} />
      
      <HexiLexi 
        isLexi={isLexi}
        setIsLexi={setIsLexi}
        lexiSentence={lexiSentence}
        contextSentences={contextSentences}
        initialLanguage="de"
      />
    </>
  );
}
```

### Minimal Example

```jsx
<HexiLexi 
  isLexi={true}
  setIsLexi={() => {}}
  lexiSentence={{ text: "Der Fuchs schleicht durch den Wald." }}
/>
```

---

## Props Reference

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `isLexi` | `boolean` | Controls visibility. `true` shows the component. |
| `setIsLexi` | `function` | Callback to toggle visibility. Called when user closes HexiLexi. |
| `lexiSentence` | `object` | Sentence object containing at minimum a `.text` property. |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `contextSentences` | `array` | `[]` | Array of surrounding sentence objects for richer AI context. |
| `initialLanguage` | `string` | `"de"` | Language code. Currently supports `"de"` (German). |

### Sentence Object Structure

```javascript
{
  id: 123,           // Optional: sentence ID from database
  ord: 5,            // Optional: order in story
  storyid: 42,       // Optional: parent story ID
  text: "Die Hexe braut einen Zaubertrank.",  // Required
  characterid: 7     // Optional: speaking character
}
```

Only the `text` property is used by HexiLexi; other fields pass through for parent app reference.

---

## Learning Modes

HexiLexi offers four pedagogical approaches:

| Mode | Name | Icon | Behavior | Points |
|------|------|------|----------|--------|
| 1 | Erklären | 📖 | Direct explanation with follow-up option | 2 |
| 2 | Entdecken | 🔍 | 3-phase guided discovery (context → narrowing → confirmation) | 10 |
| 3 | Synonym | 🪞 | Present similar words, ask for meaning | 5 |
| 4 | Wort-Teile | 🧩 | Decompose compound words (two phases) | 8 |

### Mode 4 Restrictions

Wort-Teile only activates for detected compound words. HexiLexi runs a detection pass on sentence load and dims non-compound words when this mode is selected.

### Mode Configuration

Modes can be enabled or disabled in `config.js`:

```javascript
conversation: {
  modes: {
    1: { enabled: true, ... },
    2: { enabled: false, ... },  // Disabled
    3: { enabled: true, ... },
    4: { enabled: true, ... }
  }
}
```

---

## Configuration Options

### Developer Features

Located in `config.js`:

```javascript
features: {
  showDeveloperOptions: true,   // Shows dev tools button
  enableSpeechInput: true       // Enables voice input
}
```

**Production settings:**

```javascript
features: {
  showDeveloperOptions: false,
  enableSpeechInput: true
}
```

### Rate Limiting

```javascript
rateLimiting: {
  maxRequestsPerMinute: 25,
  queueMaxSize: 3,
  timeoutLimit: 45000,
  thinkingPopupDelay: 10000
}
```

---

## User Flow

1. Parent app displays sentence with HexiLexi trigger
2. User clicks trigger → `setIsLexi(true)` + sentence data passed
3. HexiLexi opens as modal
4. User selects learning mode
5. User clicks a word to begin conversation
6. AI guides user through discovery with MCQ options
7. On success: points awarded, confetti displayed
8. On max turns: answer revealed, encouragement given
9. User closes modal → `setIsLexi(false)` called

### Interaction Diagram

```
Parent App                    HexiLexi
    │                            │
    ├─── setIsLexi(true) ───────▶│
    ├─── lexiSentence ──────────▶│
    │                            │
    │                            ├── User selects mode
    │                            ├── User clicks word
    │                            ├── AI conversation (1-8 turns)
    │                            ├── Points/Level update
    │                            │
    │◀──── setIsLexi(false) ─────┤ (user closes)
    │                            │
```

---

## Alternative Integration Methods

### iframe with postMessage

For non-React parent applications:

**Parent (host app):**

```javascript
const frame = document.getElementById('hexilexi-frame');
frame.contentWindow.postMessage({
  type: 'SET_SENTENCE',
  sentence: 'Die Hexe braut einen Zaubertrank.',
  context: [],
  language: 'de'
}, '*');
```

**HexiLexi (add to App.js):**

```javascript
useEffect(() => {
  const handleMessage = (event) => {
    if (event.data.type === 'SET_SENTENCE') {
      setSentence(event.data.sentence);
      setContext(event.data.context || []);
      setLanguage(event.data.language || 'de');
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### URL Parameters

Open HexiLexi in a popup window:

```javascript
const sentence = encodeURIComponent('Die Hexe braut einen Zaubertrank.');
window.open(
  `https://hexilexi.streen.com?sentence=${sentence}&lang=de`,
  'HexiLexi',
  'width=700,height=800'
);
```

---

## API Requirements

HexiLexi requires access to a single endpoint:

| Endpoint | Purpose |
|----------|---------|
| `https://llm.ais-lab.eu/chat` | LLM conversation API |

### CORS Configuration

The LLM API must allow requests from the deployment domain. Credentials are project-internal and configured in `config.js`.

---

## Persistence

Progress is stored client-side via cookies:

| Cookie | Content |
|--------|---------|
| `hexilexi_points` | Accumulated points |
| `hexilexi_level` | Current level (1–10) |
| `hexilexi_streak` | Consecutive correct answers |
| `hexilexi_learned_words` | JSON array of learned word objects |
| `hexilexi_username` | Display name |

Cookies persist for 365 days by default.

---

## UI Behavior

### Word Selection

- Words in the sentence are clickable
- Mode 4 dims non-compound words
- Active word is highlighted
- Clicking disabled during API calls

### MCQ Options

- Generated by AI, shuffled before display
- Three options: correct, close distractor, obviously wrong
- Clicking submits immediately

### Loading States

- Skeleton loader during API calls
- "Still thinking" popup after 10 seconds
- Auto-timeout at 45 seconds

### Celebrations

- Confetti on correct answers
- Level-up announcement on threshold crossing

---

## Files Reference

| File | Purpose |
|------|---------|
| `App.js` | Main component, state management, UI |
| `App.css` | Styles, animations, theme |
| `config.js` | Settings, prompts, mode configuration |
| `llmService.js` | API calls, rate limiting, answer evaluation |
| `stories.js` | Test sentences for development |

---

## Notes

- German is the primary language; English support is for development only
- Context sentences significantly improve AI response quality
- Progress data never leaves the browser
- The component handles its own error states and displays user-friendly messages

---

*Last updated: January 2026*
