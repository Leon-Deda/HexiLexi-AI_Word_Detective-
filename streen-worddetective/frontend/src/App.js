import React, { useState, useRef, useEffect, Component } from "react";
import { Button, Input, Card, Typography, message, Modal, Popover, Divider, Collapse, Select } from "antd";
import "./App.css";
import { startConversation, continueConversation, detectWordTypes, explainMore, requestManager } from "./llmService";
import { config } from "./config";
import { stories } from "./stories";

/**
 * SkeletonLoader Component
 * Shows animated loading placeholder while HexiLexi is thinking.
 * Styled to look like an incoming chat bubble.
 */
const SkeletonLoader = () => (
  <div className="skeleton-container">
    <div className="skeleton-avatar">
      <span role="img" aria-label="thinking">🔮</span>
    </div>
    <div className="skeleton-bubble">
      <div className="skeleton-typing-dots">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
      </div>
      <div className="skeleton-line" style={{ width: '85%', animationDelay: '0s' }}></div>
      <div className="skeleton-line" style={{ width: '65%', animationDelay: '0.1s' }}></div>
      <div className="skeleton-line" style={{ width: '45%', animationDelay: '0.2s' }}></div>
    </div>
  </div>
);

const { Title, Paragraph } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

// Error Boundary for graceful error handling
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('HexiLexi Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          background: '#fff8e7', 
          borderRadius: '20px',
          margin: '20px',
          border: '2px dashed #ffc107'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🧙‍♀️💫</div>
          <h2 style={{ color: config.ui.colors.primary }}>Oops! Ein magischer Fehler ist passiert!</h2>
          <p style={{ color: '#666' }}>{config.ai.personality.name} muss kurz nachdenken...</p>
          <Button 
            type="primary" 
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '20px', background: config.ui.colors.primary, borderColor: config.ui.colors.primary }}
          >
            Nochmal versuchen ✨
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Cookie helpers
const setCookie = (name, value, days = 365) => {
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  let expires = "expires="+ d.toUTCString();
  const val = typeof value === 'object' ? JSON.stringify(value) : value;
  document.cookie = name + "=" + encodeURIComponent(val) + ";" + expires + ";path=/";
}

const getCookie = (name) => {
  let nameEQ = name + "=";
  let ca = document.cookie.split(';');
  for(let i=0;i < ca.length;i++) {
    let c = ca[i];
    while (c.charAt(0)===' ') c = c.substring(1,c.length);
    if (c.indexOf(nameEQ) === 0) {
      const val = decodeURIComponent(c.substring(nameEQ.length,c.length));
      try {
        return JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
  }
  return null;
}

// Sanitize user input to prevent XSS attacks
// Removes HTML tags and script content while preserving German characters
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return input;
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
    .slice(0, 200); // Limit length
}

// Helper to clean up spoken text
function tidySentence(raw, language = 'en') {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.trim();

  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s*\.\s*/g, '. ');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+\./g, '.');
  s = s.replace(/\s+$/, '');

  if (!/[.!?]$/.test(s)) s = s + '.';
  s = s.charAt(0).toUpperCase() + s.slice(1);

  // German capitalization logic
  if (language && language.toLowerCase().startsWith('de')) {
    const triggers = new Set([
      'der','die','das','ein','eine','einen','einem','einer','eines','den','dem','des',
      'im','ins','am','ans','zum','zur','vom','beim','in','auf','an','vor','mit','ohne','für',
      'mein','meine','dein','deine','sein','seine','ihr','ihre','unser','unsere','euer','eure','ihrer'
    ]);

    const tokens = s.split(/(\s+|[,.!?])/);
    let prevReal = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t || /\s+|[,.!?]/.test(t)) continue;
      const lower = t.toLowerCase();
      const isFirstReal = tokens.slice(0, i).every(x => !x || /\s+|[,.!?]/.test(x));
      if (isFirstReal) {
        tokens[i] = t.charAt(0).toUpperCase() + t.slice(1);
        prevReal = lower;
        continue;
      }
      if (prevReal && triggers.has(prevReal) && /^[a-zäöüß]+$/i.test(t)) {
        tokens[i] = t.charAt(0).toUpperCase() + t.slice(1);
      }
      prevReal = lower;
    }
    s = tokens.join('').trim();
    s = s.replace(/\s*,\s*/g, ', ').replace(/\s*\.\s*/g, '. ').trim();
    if (!/[.!?]$/.test(s)) s = s + '.';
  }

  return s;
}

// Text formatting helper - handles **bold**, *bold*, and trailing emoji
const renderWithFormatting = (text) => {
  if (!text) return null;
  let result = [];
  let remaining = String(text);
  let keyIdx = 0;
  
  // First: extract trailing emoji (at end of message)
  // Emoji regex covers most common emoji including multi-char ones
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]+$/u;
  const trailingEmojiMatch = remaining.match(emojiRegex);
  let trailingEmoji = null;
  
  if (trailingEmojiMatch) {
    trailingEmoji = trailingEmojiMatch[0];
    remaining = remaining.slice(0, -trailingEmoji.length).trimEnd();
  }
  
  // Second: process **bold** and *bold* formatting
  const boldRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  
  while ((match = boldRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={keyIdx++}>{remaining.slice(lastIndex, match.index)}</span>);
    }
    const matched = match[0];
    if (matched.startsWith('**') && matched.endsWith('**')) {
      result.push(<strong key={keyIdx++}>{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      result.push(<strong key={keyIdx++}>{matched.slice(1, -1)}</strong>);
    }
    lastIndex = boldRegex.lastIndex;
  }
  if (lastIndex < remaining.length) {
    result.push(<span key={keyIdx++}>{remaining.slice(lastIndex)}</span>);
  }
  
  // Add trailing emoji with larger styling
  if (trailingEmoji) {
    result.push(<span key={keyIdx++} className="message-emoji">{trailingEmoji}</span>);
  }
  
  return result.length > 0 ? result : null;
};
const renderWithBold = renderWithFormatting;

// Translations (German only - HexiLexi is a German learning app)
const getTranslations = (userName) => ({
  de: {
    title: config.ai.personality.name,
    clickWordPrompt: `Hallo ${userName}! Klicke auf ein Wort und ich helfe dir!`,
    speakButton: "🎤",
    stopButton: "⏹",
    thinking: `🔮 ${config.ai.personality.name} denkt nach...`,
    cooldownMessage: "🌟 Einen Moment noch...",
    busyMessage: `⏳ ${config.ai.personality.name} ist beschäftigt...`,
    rateLimitMessage: "🔮 Bitte warte einen Moment!",
    speechNotSupported: "🎤 Dein Browser kann leider nicht zuhören.",
    speechError: "🎤 Ups! ",
    connectionError: `🧙‍♀️ Ups! ${config.ai.personality.name} ist gerade etwas verwirrt. Versuch es nochmal!`,
    timeoutError: "🔮 Das dauert zu lange... Versuch es nochmal!",
    answerPlaceholder: "Deine Antwort...",
    submitAnswer: "Antworten",
    currentPoints: "Punkte",
    nextLevelAt: "Nächstes Level",
    viewRanks: "Ränge ansehen",
    ranksTitle: "Wort-Detektiv Ränge",
    pointsRequired: "Benötigt",
    selectWord: "Wähle ein Wort!",
    explainMore: "Erkläre mehr",
    levelUpPrefix: "Levelaufstieg!",
    profileTitle: "Profil",
    myName: "Mein Name",
    myDictionary: "📖 Mein Wörterbuch",
    resetProgress: "Fortschritt löschen",
    wordCollection: "Wortsammlung",
    noWordsYet: "Noch keine Wörter gesammelt.",
    alreadyKnown: "Das kennst du schon!",
    resetConfirm: "Wirklich alles löschen?",
    resetComplete: "Alles gelöscht.",
    namePlaceholder: "Name",
    streakTitle: "Serie",
    detectingWords: "Analysiere...",
    conversationComplete: "Fertig!",
    levels: [
      { name: "Neugieriger Späher", message: "Eine große Reise beginnt! 🌱" },
      { name: "Lehrling", message: "Du lernst schnell! 🔎" },
      { name: "Rätsellöser", message: "Dir entgeht nichts! 🔦" },
      { name: "Spurensucher", message: "Dem Wissen auf der Spur! 🐾" },
      { name: "Rätselmeister", message: "Du löst sie alle! 🧩" },
      { name: "Geheimnishüter", message: "Die Worte flüstern zu dir! 🤫" },
      { name: "Wahrheitssucher", message: "Auf der Suche nach der Bedeutung! 👁️" },
      { name: "Weisheitswanderer", message: "Auf dem Pfad der Weisheit! 🦉" },
      { name: "Großes Orakel", message: "Du siehst alle Bedeutungen! 🔮" },
      { name: "Oberster Wortzauberer", message: "Deine Magie ist legendär! 🧙‍♀️" }
    ]
  }
});

// Helper to get translations (always German)
const getT = (userName) => getTranslations(userName).de;

// Typewriter hook
const useTypewriter = (text, speed = 10) => {
  const [displayedText, setDisplayedText] = useState('');
  React.useEffect(() => {
    if (!text) { setDisplayedText(''); return; }
    if (text.length < 10) { setDisplayedText(text); return; }
    let i = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      i++;
      setDisplayedText(text.substring(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return displayedText;
};

// Hexi Message Component
const HexiMessage = ({ text, options, onOptionClick, conversationDone }) => {
  const displayed = useTypewriter(text);
  return (
    <div className="speech-bubble hexilexi">
      <div style={{ position: 'relative' }}>
        {renderWithBold(displayed)}
        {displayed.length < text.length && <span className="typewriter-cursor"></span>}
      </div>
      {options && options.length > 0 && (
        <div className="options-container">
          {options.map((opt, i) => (
            <Button 
              key={i} 
              className="option-btn"
              size="middle" 
              onClick={() => onOptionClick(opt)}
              disabled={conversationDone}
              style={{ borderColor: config.ui.colors.primary, color: config.ui.colors.primary, background: 'white' }}
            >
              {opt}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

// Main Component
function App({ 
  isLexi = true,
  setIsLexi = () => {},
  lexiSentence: initialLexiSentence = { 
    id: 0, 
    ord: 0, 
    storyid: 0, 
    text: "Die Hexe braut einen geheimnisvollen Zaubertrank in ihrem großen Kessel.", 
    characterid: 0 
  },
  contextSentences: initialContextSentences = [],
  initialLanguage = "de"
}) {
  const [devOptions, setDevOptions] = useState({ selectedStoryId: null, selectedSentenceId: null });
  const [isDevModalVisible, setIsDevModalVisible] = useState(false);
  const [lexiSentence, setLexiSentence] = useState(initialLexiSentence);
  const [contextSentences, setContextSentences] = useState(initialContextSentences);
  const [sentence, setSentence] = useState(lexiSentence?.text);
  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [language, setLanguage] = useState(initialLanguage); // Kept for integration compatibility, currently German-only
  
  // Logic to handle sentence updates from DevTools or Props
  useEffect(() => {
    if (config.features.showDeveloperOptions && devOptions.selectedStoryId && devOptions.selectedSentenceId) {
      const story = stories[devOptions.selectedStoryId];
      if (story) {
        const selectedSentenceObj = story.find(s => s.id === devOptions.selectedSentenceId);
        if (selectedSentenceObj) {
          setLexiSentence(selectedSentenceObj);
          setSentence(selectedSentenceObj.text);
          const currentIndex = story.findIndex(s => s.id === devOptions.selectedSentenceId);
          const newContext = [];
          if (currentIndex > 0) newContext.push(story[currentIndex - 1]);
          if (currentIndex < story.length - 1) newContext.push(story[currentIndex + 1]);
          setContextSentences(newContext);
        }
      }
    } else {
      setLexiSentence(initialLexiSentence);
      setSentence(initialLexiSentence.text);
      setContextSentences(initialContextSentences);
    }
  }, [devOptions, initialLexiSentence, initialContextSentences]);

  const [mode, setMode] = useState(2);
  const [, setSessionId] = useState("");
  const [turn, setTurn] = useState(1);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [conversationThread, setConversationThread] = useState([]);
  const [userAnswer, setUserAnswer] = useState("");
  const [conversationDone, setConversationDone] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [currentAnalysis, setCurrentAnalysis] = useState(null); // Stored for debugging/future features
  const [wordTypes, setWordTypes] = useState({}); // To store word classifications
  const [detectingWords, setDetectingWords] = useState(false);
  const [wordAnalysis, setWordAnalysis] = useState(null); // stores architect's analysis for the current word
  
  // Interaction locking state
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [showThinkingPopup, setShowThinkingPopup] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Multi-phase mode state (for Wort-Teile and Entdecken modes)
  const [compositeState, setCompositeState] = useState({ phase: 1, foundParts: [], correctAnswers: [] });

  // Persistence
  const [points, setPoints] = useState(() => parseInt(getCookie('hexilexi_points') || '0'));
  const [level, setLevel] = useState(() => parseInt(getCookie('hexilexi_level') || '1'));
  const [streak, setStreak] = useState(() => parseInt(getCookie('hexilexi_streak') || '0'));
  const [showLevelDetails, setShowLevelDetails] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  const [userName, setUserName] = useState(() => getCookie('hexilexi_username') || 'Neugierige Katze');
  const [learnedWords, setLearnedWords] = useState(() => {
    const saved = getCookie('hexilexi_learned_words');
    return Array.isArray(saved) ? saved : [];
  });
  const [showDictionary, setShowDictionary] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const recognitionRef = useRef(null);

  // Always use German translations
  const t = getT(userName);
  const LEVELS = t.levels;
  const currentLevelInfo = LEVELS[Math.min(level - 1, LEVELS.length - 1)] || LEVELS[LEVELS.length - 1];
  
  // Handle thinking popup and timeout logic
  useEffect(() => {
    let intervalId;
    if (loading && thinkingStartTime) {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - thinkingStartTime;
        
        // Show "still thinking" popup after delay
        if (elapsed > config.rateLimiting.thinkingPopupDelay && !showThinkingPopup) {
          setShowThinkingPopup(true);
        }
        
        // Force unlock after total timeout
        if (elapsed > config.rateLimiting.timeoutLimit) {
          setLoading(false);
          setThinkingStartTime(null);
          setShowThinkingPopup(false);
          message.error(t.timeoutError);
          requestManager.cancelPending();
        }
      }, 500);
    } else {
      setShowThinkingPopup(false);
    }
    
    return () => clearInterval(intervalId);
  }, [loading, thinkingStartTime, showThinkingPopup, t.timeoutError]);

  // Analyze word types when sentence changes
  useEffect(() => {
    const analyzeWords = async () => {
      if (!sentence) return;
      setDetectingWords(true);
      setWordTypes({}); // Reset on new sentence
      try {
        const words = [...new Set(sentence.match(/\b(\w+)\b/g) || [])];
        if (words.length > 0) {
          const types = await detectWordTypes(words);
          setWordTypes(types);
        }
      } catch (error) {
        console.error("Error detecting word types:", error);
        setWordTypes({});
      } finally {
        setDetectingWords(false);
      }
    };
    analyzeWords();
  }, [sentence]);

  // Auto-switch to first enabled mode if current mode becomes disabled
  useEffect(() => {
    const currentModeInfo = config.conversation.modes[mode];
    // Check if current mode is disabled (either via enabled flag or composite restrictions)
    if (currentModeInfo?.enabled === false) {
      // Find first enabled mode
      const firstEnabledMode = Object.keys(config.conversation.modes)
        .map(Number)
        .find(m => config.conversation.modes[m].enabled !== false);
      if (firstEnabledMode && firstEnabledMode !== mode) {
        setMode(firstEnabledMode);
      }
    }
  }, [mode]);


  // Speech Handler (German only)
  const startListening = () => {
    if (listening || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
        message.warning(t.speechNotSupported);
      }
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "de-DE"; // German only
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join(' ').trim();
      const cleaned = tidySentence(transcript, 'de');
      conversationThread.length > 0 ? setUserAnswer(cleaned) : setSentence(cleaned);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
    }
  };

  // Start Conversation - with rate limiting and response-based locking
  const handleClickWordConversation = async (w) => {
    // RESPONSE-BASED LOCKING: Block if already loading
    if (loading) {
      return;
    }
    
    // Check if rate limited (per-minute)
    if (isRateLimited) {
      message.warning(t.rateLimitMessage);
      return;
    }
    
    const cleanedWord = (w || "").replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
    
    // IMPORTANT: Set loading and thinking start time FIRST to block any further clicks
    setLoading(true);
    setThinkingStartTime(Date.now());
    setWord(cleanedWord);
    setConversationThread([]);
    setConversationHistory([]);
    setTurn(1);
    setConversationDone(false);
    setCompositeState({ phase: 1, foundParts: [], correctAnswers: [] }); // Reset multi-phase state

    let fullContext = sentence;
    if (contextSentences?.length > 0) {
      const contextTexts = contextSentences.map(s => s.text || s).filter(Boolean);
      if (contextTexts.length > 0) fullContext = [...contextTexts, sentence].join(' ');
    }

    try {
      // the new architecture: startConversation returns analysis from the Architect
      const { question, sessionId: newSessionId, options, done, analysis, phase, foundParts, correctAnswers } = await startConversation(
        cleanedWord, fullContext, 'de', mode
      );
      setCurrentAnalysis(analysis);
      setSessionId(newSessionId);
      setWordAnalysis(analysis);
      if (phase !== undefined) setCompositeState({ phase, foundParts: foundParts || [], correctAnswers: correctAnswers || [] });
      setConversationThread([{ speaker: 'hexilexi', message: question, options: options || [] }]);
      setConversationHistory([{ role: "assistant", content: question }]);
      if (done) addPoints(cleanedWord, question);
    } catch (error) {
      if (error.message === 'RATE_LIMITED') {
        message.warning(t.rateLimitMessage);
        setIsRateLimited(true);
        setTimeout(() => setIsRateLimited(false), 5000);
      } else if (error.message === 'QUEUE_FULL') {
        message.info(t.busyMessage);
      } else {
        message.error(t.connectionError);
      }
    } finally {
      setLoading(false);
      setThinkingStartTime(null);
    }
  };

  const addPoints = (completedWord, definition, earnedPoints = null) => {
    const isDuplicate = learnedWords.some(item => item.word.toLowerCase() === (completedWord || "").toLowerCase() && item.sentence === sentence);
    if (isDuplicate) {
      message.info(t.alreadyKnown);
      return;
    }
    const newLearned = [...learnedWords, { word: completedWord, definition, sentence, timestamp: new Date().toISOString() }];
    setLearnedWords(newLearned);
    setCookie('hexilexi_learned_words', newLearned);
    let amount = earnedPoints !== null ? earnedPoints : (config.conversation.modes[mode]?.points || 0);
    const newPoints = points + amount;
    setPoints(newPoints);
    setCookie('hexilexi_points', newPoints);
    setStreak(streak + 1);
    setCookie('hexilexi_streak', streak + 1);
    const newLevel = 1 + Math.floor(newPoints / 50);
    if (newLevel > level) {
      setLevel(newLevel);
      setCookie('hexilexi_level', newLevel);
      message.success(`🎉 ${t.levelUpPrefix} ${newLevel}!`);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  };

  // Submit Answer - with spam protection
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || conversationDone || isRateLimited || loading) return;
    
    // Sanitize and prepare user input
    const sanitizedAnswer = sanitizeInput(userAnswer);
    if (!sanitizedAnswer) return;
    
    // Set loading immediately to prevent double-submit
    setLoading(true);
    setThinkingStartTime(Date.now());
    setConversationThread(prev => [...prev, { speaker: 'kid', message: sanitizedAnswer }]);
    const currentAnswer = sanitizedAnswer;
    setUserAnswer("");

    let fullContext = sentence;
    if (contextSentences?.length > 0) {
      const contextTexts = contextSentences.map(s => s.text || s).filter(Boolean);
      if (contextTexts.length > 0) fullContext = [...contextTexts, sentence].join(' ');
    }

    try {
      // pass the stored analysis and composite state
      const result = await continueConversation(
        word, fullContext, 'de', mode, turn + 1, currentAnswer, conversationHistory, wordAnalysis, compositeState
      );
      setTurn(result.turn);
      // Update multi-phase state if applicable (Wort-Teile or Entdecken)
      if (result.phase !== undefined) {
        setCompositeState({ 
          phase: result.phase, 
          foundParts: result.foundParts || [], 
          correctAnswers: result.correctAnswers || [] 
        });
      }
      const hexilexiMessage = result.feedback || result.definition;
      if (result.done) {
        setConversationDone(true);
        if (result.success && !result.maxTurnsReached) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 4000);
        }
        addPoints(word, hexilexiMessage, result.maxTurnsReached ? 0 : null);
      }
      setConversationThread(prev => [...prev, { speaker: 'hexilexi', message: hexilexiMessage, options: result.options || [] }]);
      setConversationHistory(prev => [...prev, { role: "user", content: currentAnswer }, { role: "assistant", content: hexilexiMessage }]);
    } catch (error) {
      if (error.message === 'RATE_LIMITED') {
        message.warning(t.rateLimitMessage);
      } else {
        message.error(t.connectionError);
      }
    } finally {
      setLoading(false);
      setThinkingStartTime(null);
    }
  };

  const handleOptionClick = (option) => {
    submitOption(option);
  };

  const submitOption = async (answer) => {
    if (conversationDone || isRateLimited || loading) return;
    
    // Sanitize option (even though options come from AI, defense in depth)
    const sanitizedAnswer = sanitizeInput(answer);
    if (!sanitizedAnswer) return;
    
    // Set loading immediately to prevent double-submit
    setLoading(true);
    setThinkingStartTime(Date.now());
    setConversationThread(prev => [...prev, { speaker: 'kid', message: sanitizedAnswer }]);
    setUserAnswer("");

    let fullContext = sentence;
    if (contextSentences?.length > 0) {
      const contextTexts = contextSentences.map(s => s.text || s).filter(Boolean);
      if (contextTexts.length > 0) fullContext = [...contextTexts, sentence].join(' ');
    }
    try {
      // pass the stored analysis and composite state
      const result = await continueConversation(
        word, fullContext, 'de', mode, turn + 1, sanitizedAnswer, conversationHistory, wordAnalysis, compositeState
      );
      setTurn(result.turn);
      // Update multi-phase state if applicable (Wort-Teile or Entdecken)
      if (result.phase !== undefined) {
        setCompositeState({ 
          phase: result.phase, 
          foundParts: result.foundParts || [], 
          correctAnswers: result.correctAnswers || [] 
        });
      }
      const hexilexiMessage = result.feedback || result.definition;
      if (result.done) {
        setConversationDone(true);
        if (result.success && !result.maxTurnsReached) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 4000);
        }
        addPoints(word, hexilexiMessage, result.maxTurnsReached ? 0 : null);
      }
      setConversationThread(prev => [...prev, { speaker: 'hexilexi', message: hexilexiMessage, options: result.options || [] }]);
      setConversationHistory(prev => [...prev, { role: "user", content: answer }, { role: "assistant", content: hexilexiMessage }]);
    } catch (error) {
      message.error(t.connectionError);
    } finally {
      setLoading(false);
      setThinkingStartTime(null);
    }
  };

  const handleExplainMore = async () => {
    if (isRateLimited || loading) {
      if (isRateLimited) message.warning(t.rateLimitMessage);
      return;
    }
    
    // Set loading immediately to prevent spam
    setLoading(true);
    setThinkingStartTime(Date.now());
    setConversationThread(prev => [...prev, { speaker: 'kid', message: t.explainMore }]);
    
    let fullContext = sentence;
    if (contextSentences?.length > 0) {
      const contextTexts = contextSentences.map(s => s.text || s).filter(Boolean);
      if (contextTexts.length > 0) fullContext = [...contextTexts, sentence].join(' ');
    }
    try {
      const hexilexiMessage = await explainMore(word, fullContext, wordAnalysis, conversationHistory);
      setTurn(prev => prev + 1);
      setConversationThread(prev => [...prev, { speaker: 'hexilexi', message: hexilexiMessage, options: [] }]);
      setConversationHistory(prev => [...prev, { role: "user", content: t.explainMore }, { role: "assistant", content: hexilexiMessage }]);
    } catch (error) {
      if (error.message === 'RATE_LIMITED') {
        message.warning(t.rateLimitMessage);
      } else {
        message.error(t.connectionError);
      }
    } finally {
      setLoading(false);
      setThinkingStartTime(null);
    }
  };

  if (!isLexi) return null;

  return (
    <>
      <Modal
        open={isLexi}
        onCancel={() => setIsLexi(false)}
        footer={null}
        width={'100%'}
        className="main-app-modal"
      >
        <div className="App">
          <Card className="story-card" bordered={false}>
            
            {/* HEADER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 25px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Popover
                  content={
                    <div style={{ width: 250 }}>
                      <div style={{ marginBottom: 15 }}>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{t.myName}</div>
                        <Input value={userName} onChange={(e) => { setUserName(e.target.value); setCookie('hexilexi_username', e.target.value); }} placeholder={t.namePlaceholder} />
                      </div>
                      <Button block onClick={() => { setIsProfileOpen(false); setShowDictionary(true); }} style={{ marginBottom: 10 }}>{t.myDictionary}</Button>
                      <Divider style={{ margin: '10px 0' }} />
                      <Button block danger size="small" onClick={() => { if (window.confirm(t.resetConfirm)) { setPoints(0); setLevel(1); setLearnedWords([]); setCookie('hexilexi_points', 0); setCookie('hexilexi_level', 1); setCookie('hexilexi_learned_words', []); setStreak(0); setCookie('hexilexi_streak', 0); message.success(t.resetComplete); } }}>{t.resetProgress}</Button>
                    </div>
                  }
                  title={t.profileTitle}
                  trigger="click"
                  open={isProfileOpen}
                  onOpenChange={setIsProfileOpen}
                >
                  <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} className="profile-trigger">
                    <Title level={3} style={{ margin: 0 }}>🧙‍♀️ {t.title}</Title>
                    <span style={{ fontSize: 12, color: '#999' }}>▼</span>
                  </div>
                </Popover>
                <div style={{ display: 'flex', alignItems: 'center', background: '#fff0f6', padding: '4px 10px', borderRadius: '20px', border: '1px solid #ffadd2', marginLeft: '10px' }} title={t.streakTitle}>
                  <span style={{ fontSize: '16px', marginRight: '4px' }}>🔥</span>
                  <span style={{ fontWeight: 'bold', color: '#c41d7f' }}>{streak}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {config.features.showDeveloperOptions && <Button size="small" onClick={() => setIsDevModalVisible(true)}>Dev Tools</Button>}
                <Button size="small" onClick={() => setIsLexi(false)} danger type="text" style={{ fontSize: 18, fontWeight: 'bold' }}>✕</Button>
              </div>
            </div>

            {/* NEW: Thinking Notification Bar */}
            <div className={`thinking-notification ${showThinkingPopup ? 'visible' : ''}`}>
              {config.rateLimiting.thinkingMessage}
            </div>
            
            <div className="story-card-content">
              {/* LEFT PANEL */}
              <div className="left-panel">
                {/* XP Bar */}
                <div className="xp-wrapper" style={{ marginBottom: '20px', position: 'relative', zIndex: 10 }}>
                  <div className="xp-container" onClick={() => setShowLevelDetails(!showLevelDetails)} style={{ cursor: 'pointer' }}>
                    <div className="level-badge" style={{ fontWeight:'bold', color: '#9c27b0' }}>Lvl {level}</div>
                    <div className="xp-bar-bg">
                      <div className="xp-bar-fill" style={{ width: `${points % 50 * 2}%` }}></div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>{points} Pts</div>
                    <div style={{ marginLeft: '8px', fontSize: '10px', color: '#999', transform: showLevelDetails ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>▼</div>
                  </div>
                  <div className={`level-details-panel ${showLevelDetails ? 'open' : ''}`}>
                    <div className="level-details-content">
                      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#9c27b0', marginBottom: '5px' }}>{currentLevelInfo.name}</div>
                        <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>"{currentLevelInfo.message}"</div>
                      </div>
                      <div className="stat-row"><span>{t.currentPoints}:</span><strong>{points}</strong></div>
                      <div className="stat-row"><span>{t.nextLevelAt}:</span><strong>{level * 50}</strong></div>
                      <div style={{ textAlign: 'center', marginTop: '12px' }}>
                        <Button size="small" type="dashed" shape="round" onClick={(e) => { e.stopPropagation(); setShowRankings(true); }} style={{ fontSize: '12px', color: '#9c27b0', borderColor: '#e1bee7' }}>🏆 {t.viewRanks}</Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mascot (Video Avatar) */}
                <div className="wizard-container" style={{ display: 'flex', justifyContent: 'center', margin: '15px 0' }}>
                  <video
                    className="wizard-avatar"
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ borderRadius: '50%', objectFit: 'cover' }}
                  >
                    <source src="/Witch1.webm" type="video/webm" />
                  </video>
                </div>

                {/* Mode Selection (Rounded Squares) - Only show enabled modes */}
                <div className="difficulty-toggle-group" style={{ marginBottom: 10, opacity: loading ? 0.5 : 1 }}>
                  {Object.keys(config.conversation.modes)
                    .filter(modeKey => config.conversation.modes[modeKey].enabled !== false) // Only show enabled modes
                    .map(modeKey => {
                    const modeInfo = config.conversation.modes[modeKey];
                    const isCompositeMode = modeInfo.type === 'composite';
                    // mode 4 (composite/wortTeile) only enabled if there's at least one true composite word
                    const isNoCompositeWords = isCompositeMode && !Object.values(wordTypes).some(type => 
                      type === 'kompositum' || type === 'composite'
                    );
                    // Disable mode switching during cooldown or loading
                    const isDisabled = isNoCompositeWords || loading;
                    
                    return (
                      <div 
                        key={modeKey}
                        className={`difficulty-btn ${mode === parseInt(modeKey) ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`} 
                        onClick={() => !isDisabled && setMode(parseInt(modeKey))}
                        style={{ opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                      >
                        <span className="difficulty-icon">{modeInfo.icon}</span>
                        <span className="difficulty-label">{modeInfo.shortName}</span>
                      </div>
                    );
                  })}
                </div>
                
                {/* Mode Description */}
                <div style={{ textAlign: 'center', height: '20px', color: '#888', fontSize: '13px', marginBottom: 20, fontWeight: '500' }}>
                  {detectingWords ? (
                    <span style={{ fontStyle: 'italic' }}>🔍 {t.detectingWords}</span>
                  ) : (
                    <>
                      <span style={{ fontSize: '14px', marginRight: '5px' }}>{config.conversation.modes[mode].icon}</span>
                      {config.conversation.modes[mode].name}: {config.conversation.modes[mode].points} Punkte
                    </>
                  )}
                </div>

                {/* Sentence & Words */}
                {sentence && (
                  <>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8, textAlign: 'center' }}>
                      {loading ? (
                        <span style={{ color: '#9c27b0' }}>{t.thinking}</span>
                      ) : (
                        t.clickWordPrompt
                      )}
                    </div>
                    <Paragraph style={{ padding: '15px', background: 'rgba(255,255,255,0.6)', borderRadius: 12, border: '2px solid #f0e68c', fontSize: 16, lineHeight: 1.8, textAlign: 'left' }}>
                      {sentence.split(/(\s+)/).map((w, i) => {
                        if (/\s+/.test(w)) return <span key={i}>{w}</span>; // Keep whitespace
                        const cleanedToken = (w || "").replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
                        if (!cleanedToken) return <span key={i}>{w}</span>;

                        const isActive = cleanedToken.toLowerCase() === (word || "").toLowerCase();
                        // Disable clicking during loading (interaction lock)
                        let isClickable = !loading;
                        if (isClickable && mode === 4) {
                          // mode 4 only allows clicking true composite words
                          const type = wordTypes[cleanedToken];
                          isClickable = type === 'kompositum' || type === 'composite';
                        }
                        
                        return (
                          <span
                            key={i}
                            className={`word${isActive ? " active" : ""}${!isClickable ? " word-dimmed" : ""}`}
                            onClick={() => isClickable && handleClickWordConversation(cleanedToken)}
                            style={{ opacity: isClickable ? 1 : 0.5, cursor: isClickable ? 'pointer' : 'default' }}
                          >
                            {w}
                          </span>
                        );
                      })}
                    </Paragraph>
                  </>
                )}
              </div>

              {/* RIGHT PANEL: Chat */}
              <div className="right-panel">
                {conversationThread.length > 0 ? (
                  <>
                    <div className="conversation-thread-inline" style={{ flex: 1, overflowY: 'auto', marginBottom: 15, padding: '10px' }}>
                      {conversationThread.map((msg, idx) => {
                        const isHexi = msg.speaker === 'hexilexi';
                        const messageKey = `${word}-${mode}-${idx}-${msg.message.slice(0, 20)}`;
                        return (
                          <div key={messageKey} style={{ display: 'flex', marginBottom: 20, alignItems: 'flex-start', justifyContent: isHexi ? 'flex-start' : 'flex-end' }}>
                            {isHexi && (
                              <div className="hexilexi-avatar-container">
                                <video src="/Witch1.webm" autoPlay loop muted playsInline className="hexilexi-avatar-video" />
                              </div>
                            )}
                            {isHexi ? <HexiMessage text={msg.message} options={msg.options} onOptionClick={handleOptionClick} conversationDone={conversationDone} /> : <div className="speech-bubble kid">{renderWithBold(msg.message)}</div>}
                            {!isHexi && <div style={{ marginLeft: 12, fontSize: '32px' }}>🐈‍⬛</div>}
                          </div>
                        );
                      })}
                      {loading && <SkeletonLoader />}
                    </div>

                    {!loading && (
                      <div className="magic-input-container">
                        {mode === 1 ? (
                          <Button type="primary" block size="large" onClick={handleExplainMore} icon={<span style={{ fontSize: '20px' }}>✨</span>}>{t.explainMore}</Button>
                        ) : conversationDone ? (
                          <div style={{ textAlign: 'center', color: '#888', padding: '10px' }}>{t.conversationComplete}</div>
                        ) : (
                          <>
                            <Input
                              className="magic-input"
                              placeholder={t.answerPlaceholder}
                              value={userAnswer}
                              onChange={(e) => setUserAnswer(e.target.value)}
                              disabled={conversationDone}
                              onPressEnter={(e) => { 
                                if (!e.shiftKey && !conversationDone) { 
                                  e.preventDefault(); 
                                  if (['sparkle','magic','hexi'].includes(e.target.value.toLowerCase().trim())) {
                                    setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2000); setUserAnswer(""); return;
                                  }
                                  handleSubmitAnswer(); 
                                } 
                              }}
                            />
                            <Button type="primary" className="magic-send-btn" onClick={handleSubmitAnswer} disabled={conversationDone} icon={<span style={{ fontSize: '20px' }}>✨</span>} />
                            <Button 
                              type={listening ? "danger" : "default"} 
                              onMouseDown={startListening}
                              onMouseUp={stopListening}
                              onMouseLeave={stopListening}
                              onTouchStart={startListening}
                              onTouchEnd={stopListening}
                              shape="circle" 
                              className={`mic-btn ${listening ? 'listening' : ''}`}
                              icon={<span style={{ fontSize: '20px' }}>{listening ? t.stopButton : t.speakButton}</span>} 
                            />
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : loading ? (
                  /* Show skeleton when word clicked but first response not yet received */
                  <div className="conversation-thread-inline" style={{ flex: 1, overflowY: 'auto', marginBottom: 15, padding: '10px' }}>
                    <SkeletonLoader />
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', flexDirection: 'column' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>👈</div>
                    <div>{t.selectWord}</div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Thinking Overlay/Popup - REMOVED */}

          {showConfetti && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '120px', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
              🎉✨🏆✨🎉
            </div>
          )}

          {/* Rankings Modal */}
          <Modal title={<div style={{ textAlign: 'center', color: '#9c27b0', fontSize: '20px' }}>🏆 {t.ranksTitle}</div>} open={showRankings} onCancel={() => setShowRankings(false)} footer={null} centered bodyStyle={{ padding: '20px 15px', maxHeight: '60vh', overflowY: 'auto' }} width={350}>
            <div className="rankings-list">
              {LEVELS.map((lvl, idx) => {
                const lvlNum = idx + 1;
                const isCurrent = lvlNum === level;
                const isUnlocked = lvlNum <= level;
                return (
                  <div key={idx} className={`ranking-item ${isCurrent ? 'current' : ''}`} style={{ display: 'flex', alignItems: 'center', padding: '12px', marginBottom: '10px', borderRadius: '16px', background: isCurrent ? '#fff8e7' : '#fff', border: isCurrent ? '2px solid #ffd700' : '1px solid #f0f0f0', opacity: isUnlocked ? 1 : 0.5 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isUnlocked ? 'linear-gradient(135deg, #9c27b0, #7b1fa2)' : '#eee', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginRight: '15px', fontSize: '16px', boxShadow: isUnlocked ? '0 2px 5px rgba(156, 39, 176, 0.3)' : 'none' }}>{lvlNum}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', color: isUnlocked ? '#333' : '#999', fontSize: '15px' }}>{lvl.name}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{idx * 50} {t.pointsRequired}</div>
                    </div>
                    {isCurrent && <div style={{ fontSize: '20px' }}>📍</div>}
                    {!isUnlocked && <div style={{ fontSize: '16px' }}>🔒</div>}
                  </div>
                );
              })}
            </div>
          </Modal>

          {/* Dictionary Modal */}
          <Modal title={<div style={{ textAlign: 'center', color: '#9c27b0', fontSize: '20px' }}>{t.wordCollection} 📚</div>} open={showDictionary} onCancel={() => setShowDictionary(false)} footer={null} centered bodyStyle={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            {learnedWords.length === 0 ? <div style={{ textAlign: 'center', color: '#999', padding: '30px 0' }}><div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>{t.noWordsYet}</div> : (
              <Collapse accordion ghost>
                {learnedWords.map((item, idx) => (
                  <Panel header={<span style={{ fontWeight: 'bold', color: '#9c27b0' }}>{item.word}</span>} key={idx}>
                    <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>{item.definition}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, fontStyle: 'italic' }}>Found in: "{item.sentence}"</div>
                  </Panel>
                ))}
              </Collapse>
            )}
          </Modal>
        </div>
      </Modal>

      {/* Developer Modal */}
      <Modal title="Developer Tools" open={isDevModalVisible} onOk={() => setIsDevModalVisible(false)} onCancel={() => setIsDevModalVisible(false)} footer={[<Button key="back" onClick={() => setIsDevModalVisible(false)}>Close</Button>]}>
        <div className="developer-options" style={{ padding: '20px 0' }}>
          <p style={{marginBottom: '10px', color: '#666'}}>Select a story and sentence to load it for testing.</p>
          <Select placeholder="Select Story" onChange={(storyId) => setDevOptions({ selectedStoryId: storyId, selectedSentenceId: null })} value={devOptions.selectedStoryId} style={{ width: '100%', marginBottom: '15px' }}>
            {Object.keys(stories).map(storyId => <Option key={storyId} value={storyId}>Story {storyId}</Option>)}
          </Select>
          <Select placeholder="Select Sentence" onChange={(sentenceId) => setDevOptions(prev => ({ ...prev, selectedSentenceId: sentenceId }))} value={devOptions.selectedSentenceId} style={{ width: '100%' }} disabled={!devOptions.selectedStoryId}>
            {devOptions.selectedStoryId && stories[devOptions.selectedStoryId].map(s => <Option key={s.id} value={s.id}>{s.ord}: {s.text.substring(0, 40)}...</Option>)}
          </Select>
        </div>
      </Modal>
    </>
  );
}

const AppWithErrorBoundary = (props) => <ErrorBoundary><App {...props} /></ErrorBoundary>;
export default AppWithErrorBoundary;