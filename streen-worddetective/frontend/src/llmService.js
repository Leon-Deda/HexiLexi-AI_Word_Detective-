/**
 * HexiLexi LLM Service v4.0
 * Complete rewrite with rate limiting, request queue, and simplified conversation flows
 * 
 * Key Features:
 * - RequestManager: Prevents server overload with rate limiting
 * - Frontend Answer Evaluation: More reliable than AI-based evaluation
 * - Mode-Specific Flows: Clean separation of conversation logic
 */

import axios from 'axios';
import { config, architectPrompt, builderPrompts, compositeDetectionPrompt, evaluationConfig } from './config.js';

// ============================================================================
// 🔧 CONFIGURATION
// ============================================================================

const LLM_CHAT_URL = config.ai.chatUrl;
const LLM_USER = config.ai.user;
const LLM_PASS = config.ai.password;
const LLM_MODEL = config.ai.model;

const getAuthHeader = () => `Basic ${btoa(`${LLM_USER}:${LLM_PASS}`)}`;

// ============================================================================
// 🛡️ REQUEST MANAGER - Rate Limiting & Queue Management
// ============================================================================

class RequestManager {
  constructor() {
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.requestCountResetTime = Date.now();
    this.pendingRequests = [];
    this.isProcessing = false;
    this.currentController = null;
    
    // Callbacks for UI updates
    this.onCooldownStart = null;
    this.onCooldownEnd = null;
    this.onBusy = null;
  }

  /**
   * Check if currently on cooldown (can't make new requests)
   */
  isOnCooldown() {
    const elapsed = Date.now() - this.lastRequestTime;
    return elapsed < config.rateLimiting.minRequestInterval;
  }

  /**
   * Get processing duration in milliseconds
   */
  getProcessingDuration() {
    if (!this.isProcessing) return 0;
    return Date.now() - this.lastRequestTime;
  }

  /**
   * Check if we've hit the per-minute limit
   */
  isRateLimited() {
    // Reset count every minute
    if (Date.now() - this.requestCountResetTime > 60000) {
      this.requestCount = 0;
      this.requestCountResetTime = Date.now();
    }
    return this.requestCount >= config.rateLimiting.maxRequestsPerMinute;
  }

  /**
   * Cancel any pending request (e.g., when user clicks new word)
   */
  cancelPending() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
    this.pendingRequests = [];
  }

  /**
   * Queue and execute a request with rate limiting
   */
  async execute(requestFn) {
    if (!config.rateLimiting.enabled) {
      return requestFn();
    }

    // Check queue size limit
    if (this.pendingRequests.length >= config.rateLimiting.queueMaxSize) {
      throw new Error('QUEUE_FULL');
    }

    // Check per-minute rate limit
    if (this.isRateLimited()) {
      throw new Error('RATE_LIMITED');
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.pendingRequests.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    const { requestFn, resolve, reject } = this.pendingRequests.shift();
    
    try {
      this.lastRequestTime = Date.now();
      this.requestCount++;
      
      // Create abort controller for this request
      this.currentController = new AbortController();
      
      const result = await requestFn(this.currentController.signal);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.currentController = null;
      this.isProcessing = false;
      
      // Process next in queue
      if (this.pendingRequests.length > 0) {
        this.processQueue();
      }
    }
  }
}

// Global request manager instance
export const requestManager = new RequestManager();

// ============================================================================
// 🔗 API CALL WRAPPER
// ============================================================================

/**
 * Make an API call to the LLM with retry logic
 */
const callChat = async (messages, maxTokens = 100, signal = null, retryCount = 0) => {
  try {
    const response = await axios.post(
      LLM_CHAT_URL,
      {
        messages,
        model: LLM_MODEL,
        stream: false,
        max_tokens: maxTokens,
        temperature: config.ai.temperature,
        top_p: config.ai.topP,
        frequency_penalty: config.ai.frequencyPenalty,
        presence_penalty: config.ai.presencePenalty
      },
      {
        headers: { 
          Authorization: getAuthHeader(), 
          'Content-Type': 'application/json' 
        },
        timeout: config.ai.timeout,
        signal // AbortController signal for cancellation
      }
    );
    
    return response.data.message?.content || response.data.content || '';
  } catch (error) {
    // Don't retry if request was cancelled
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      throw new Error('REQUEST_CANCELLED');
    }
    
    // Retry on server errors
    if (retryCount < config.ai.maxRetries) {
      await new Promise(r => setTimeout(r, config.ai.retryDelay * (retryCount + 1)));
      return callChat(messages, maxTokens, signal, retryCount + 1);
    }
    
    console.error('LLM API Error:', error.message);
    throw new Error('LLM_OFFLINE');
  }
};

/**
 * Rate-limited API call
 */
const rateLimitedCall = async (messages, maxTokens = 100) => {
  return requestManager.execute((signal) => callChat(messages, maxTokens, signal));
};

// ============================================================================
// 📊 ANSWER EVALUATION - Frontend-based for reliability
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculate similarity between two strings (0-1)
 */
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(s1, s2);
  return 1 - (distance / maxLen);
}

/**
 * Evaluate if the user's answer is correct
 * Returns { isCorrect: boolean, confidence: number, matchType: string }
 */
export function evaluateAnswer(userAnswer, correctAnswer, alternatives = []) {
  const user = userAnswer.toLowerCase().trim();
  const correct = correctAnswer.toLowerCase().trim();
  
  // Exact match
  if (user === correct) {
    return { isCorrect: true, confidence: 1, matchType: 'exact' };
  }
  
  // Check if user answer contains the correct answer
  if (user.includes(correct) || correct.includes(user)) {
    return { isCorrect: true, confidence: 0.9, matchType: 'contains' };
  }
  
  // Fuzzy match with Levenshtein
  const similarity = stringSimilarity(user, correct);
  if (similarity >= evaluationConfig.minSimilarity) {
    return { isCorrect: true, confidence: similarity, matchType: 'fuzzy' };
  }
  
  // Check against alternatives (synonyms, etc.)
  for (const alt of alternatives) {
    const altSimilarity = stringSimilarity(user, alt.toLowerCase());
    if (altSimilarity >= evaluationConfig.minSimilarity) {
      return { isCorrect: true, confidence: altSimilarity, matchType: 'alternative' };
    }
  }
  
  return { isCorrect: false, confidence: similarity, matchType: 'none' };
}

/**
 * Check if user found a composite word part
 */
export function evaluateCompositePart(userAnswer, teil1, teil2) {
  const user = userAnswer.toLowerCase().trim();
  const t1 = teil1.toLowerCase();
  const t2 = teil2.toLowerCase();
  
  const foundParts = [];
  
  // Check for Teil 1
  if (user.includes(t1) || stringSimilarity(user, t1) >= 0.8) {
    foundParts.push(teil1);
  }
  
  // Check for Teil 2
  if (user.includes(t2) || stringSimilarity(user, t2) >= 0.8) {
    foundParts.push(teil2);
  }
  
  // Check if user wrote both parts (e.g., "Sonne und Blume")
  const words = user.split(/[\s,+]+/).filter(w => w.length > 1);
  for (const word of words) {
    if (stringSimilarity(word, t1) >= 0.8 && !foundParts.includes(teil1)) {
      foundParts.push(teil1);
    }
    if (stringSimilarity(word, t2) >= 0.8 && !foundParts.includes(teil2)) {
      foundParts.push(teil2);
    }
  }
  
  return {
    foundBoth: foundParts.length === 2,
    foundOne: foundParts.length === 1,
    foundParts
  };
}

// ============================================================================
// 🏗️ ARCHITECT - Word Analysis (runs once per word)
// ============================================================================

/**
 * Analyze a word and return structured data for all modes
 */
export const analyzeWord = async (word, sentence) => {
  const userPrompt = `WORT: "${word}"
SATZ: "${sentence}"

Analysiere das Wort und gib JSON aus.`;

  const messages = [
    { role: 'system', content: architectPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const rawResponse = await rateLimitedCall(messages, 400);
    
    // Extract JSON from response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      // Architect analysis logged for debugging (uncomment in dev)
      // console.log('🏗️ Architect analysis:', analysis);
      return analysis;
    }
    
    // Fallback if JSON parsing fails
    console.warn('⚠️ Architect JSON parse failed, using fallback');
    return createFallbackAnalysis(word, sentence);
  } catch (error) {
    console.error('🏗️ Architect error:', error);
    return createFallbackAnalysis(word, sentence);
  }
};

/**
 * Fallback analysis when LLM fails
 */
const createFallbackAnalysis = (word, sentence) => ({
  bedeutung: `"${word}" ist ein interessantes Wort.`,
  kontext_bedeutung: `Im Satz wird "${word}" verwendet.`,
  hinweis1: `Denke über "${word}" nach.`,
  hinweis2: `Was könnte "${word}" bedeuten?`,
  richtig_kurz: `Bedeutung von ${word}`,
  falsch1: 'Das stimmt nicht',
  falsch2: 'Völlig falsch',
  synonyme: [],
  ist_kompositum: false,
  teile: null,
  teil1_bedeutung: null,
  teil2_bedeutung: null
});

// ============================================================================
// 🔍 COMPOSITE WORD DETECTION
// ============================================================================

/**
 * Known composite words that LLM struggles with
 */
const KNOWN_COMPOSITES = new Set([
  'sonnenblume', 'unterschlupf', 'mittagszeit', 'sonnenlicht', 'sommerwolken',
  'urteilsvermögen', 'voraussicht', 'geschwindigkeit', 'handschuh', 'regenwurm',
  'zauberlehrling', 'kindergarten', 'wasserfall', 'sternenhimmel', 'blumenvase',
  'schulbus', 'mondlicht', 'handtuch', 'zaubertrank', 'zauberkessel'
]);

/**
 * Heuristic patterns for composite words
 */
const COMPOSITE_PATTERNS = [
  /^.{4,}(blume|licht|zeit|wald|haus|baum|kind|werk|platz|kraft|sicht|schuh|trank|kessel)$/i,
  /^(sonne|mond|stern|wasser|feuer|hand|haus|garten|schul|regen|zauber).{4,}$/i,
  /^.{4,}(vermögen|fähigkeit|möglichkeit)$/i,
  /^(vor|unter|über|zwischen|hinter).{4,}(schlupf|gang|weg|raum)$/i
];

/**
 * Check if a word is likely a composite using heuristics
 */
const isLikelyComposite = (word) => {
  if (KNOWN_COMPOSITES.has(word.toLowerCase())) {
    return true;
  }
  return COMPOSITE_PATTERNS.some(pattern => pattern.test(word));
};

/**
 * Detect composite words in a list of words
 */
export const detectWordTypes = async (words) => {
  const userPrompt = `Wörter: "${words.join(', ')}"`;

  const messages = [
    { role: 'system', content: compositeDetectionPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const raw = await rateLimitedCall(messages, 200);
    const types = {};
    
    raw.split('\n').forEach(line => {
      const parts = line.split(':');
      if (parts.length === 2) {
        const word = parts[0].trim();
        let type = parts[1].trim().toLowerCase();
        
        // Override with heuristic if LLM says "einfach" but it's likely composite
        if (type === 'einfach' && isLikelyComposite(word)) {
          // Heuristic override logged for debugging (uncomment in dev)
          // console.log(`🔧 Heuristic override: "${word}" → kompositum`);
          type = 'kompositum';
        }
        
        types[word] = type;
      }
    });
    
    // Also check words that weren't in the response
    for (const word of words) {
      if (!types[word] && isLikelyComposite(word)) {
        types[word] = 'kompositum';
      }
    }
    
    return types;
  } catch (error) {
    console.error('Detection failed:', error);
    // Return heuristic-only results on error
    const types = {};
    for (const word of words) {
      types[word] = isLikelyComposite(word) ? 'kompositum' : 'einfach';
    }
    return types;
  }
};

// ============================================================================
// 🎭 CONVERSATION FLOWS - Mode-Specific
// ============================================================================

/**
 * Fisher-Yates shuffle for OPTIONS
 */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Parse response text and extract OPTIONS
 */
function parseResponse(raw, word = null, analysis = null, phase = null) {
  let text = raw;
  let options = [];
  
  // Check for success/solution indicators
  const isSuccess = /🎉|ERFOLG|Super gemacht|Genau|Fantastisch/i.test(text);
  const isSolution = /💡|LÖSUNG|Die Lösung|Beim nächsten/i.test(text);

  // Extract OPTIONS (only if not success/solution)
  const optMatch = text.match(/OPTIONS:\s*(.+)$/im);
  if (optMatch && !isSuccess && !isSolution) {
    options = optMatch[1]
      .split('|')
      .map(o => o.trim().replace(/^\[|\]$/g, '')) // Remove square brackets
      .filter(Boolean);
    
    // Prevent word leak in options
    if (word) {
      const wordLower = word.toLowerCase();
      options = options.map(opt => {
        if (opt.toLowerCase() === wordLower) {
          return 'Die richtige Bedeutung';
        }
        return opt;
      });
    }
    
    options = shuffleArray(options);
  }
  
  // Also check for inline bracketed options in the text (fallback pattern)
  if (options.length === 0 && !isSuccess && !isSolution) {
    const bracketMatches = text.match(/\[([^\]]+)\]/g);
    if (bracketMatches && bracketMatches.length >= 2) {
      options = bracketMatches.map(m => m.replace(/^\[|\]$/g, '').trim()).filter(Boolean);
      // Remove bracketed options from text
      text = text.replace(/\[([^\]]+)\]/g, '').replace(/\s{2,}/g, ' ').trim();
      options = shuffleArray(options);
    }
  }
  
  // Remove OPTIONS line from text
  text = text.replace(/OPTIONS:.*$/im, '').trim();
  
  // Clean up text - remove any remaining square brackets
  text = text
    .replace(/\[([^\]]+)\]/g, '$1') // Replace [text] with text
    .replace(/^(ERFOLG|LÖSUNG|SICHERHEIT):\s*/gi, '')
    .replace(/^SICHERHEIT:.*$/im, '')
    .replace(/^Ich bin ${config.ai.personality.name}[^!]*!\s*/i, '')
    .replace(/^Hallo[^!]*!\s*/i, '')
    .replace(/^${config.ai.personality.name} (erklärt|plaudert|erzählt) weiter[^!]*!\s*/i, '')
    .trim();
  
  // ANTI-LEAK FILTER for Phase 1-2: Remove word meaning and synonyms from response text
  if (phase && phase < 3 && analysis && !isSuccess && !isSolution) {
    const leakTerms = [];
    
    // Collect all terms that would reveal the meaning
    if (analysis.bedeutung) leakTerms.push(analysis.bedeutung);
    if (analysis.richtig_kurz) leakTerms.push(analysis.richtig_kurz);
    if (analysis.synonyme) leakTerms.push(...analysis.synonyme);
    
    // Check and warn (but don't modify text - that could break meaning)
    const textLower = text.toLowerCase();
    for (const term of leakTerms) {
      if (term && term.length > 3) {
        const termLower = term.toLowerCase();
        if (textLower.includes(termLower)) {
          console.warn(`⚠️ LEAK DETECTED in phase ${phase}: "${term}" found in response`);
          // For critical leaks, we could replace the term, but this might break context
          // Instead, we flag it for monitoring
        }
      }
    }
  }

  return { text, options, isSuccess, isSolution };
}

/**
 * Enforce maximum sentence count
 */
function enforceLength(text, maxSentences = 2) {
  if (!text) return text;
  const sentences = text.match(/[^.!?…]+[.!?…]+/g) || [text];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

// ============================================================================
// 📖 MODE 1: ERKLÄREN (Explain/Dictionary)
// ============================================================================

export const startErklaeren = async (word, sentence, analysis) => {
  const prompt = builderPrompts.erklaeren.initial(
    word,
    analysis.bedeutung,
    analysis.kontext_bedeutung
  );

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Erkläre "${word}" aus dem Satz: "${sentence}"` }
  ];

  const rawRes = await rateLimitedCall(messages, 120);
  const text = enforceLength(rawRes, 3);
  
  return {
    response: text,
    done: true, // Erklären is immediate, but can continue with "Erkläre mehr"
    analysis
  };
};

export const explainMore = async (word, sentence, analysis, history) => {
  const prompt = builderPrompts.erklaeren.explainMore(
    word,
    analysis.bedeutung,
    sentence
  );

  const messages = [
    { role: 'system', content: prompt },
    ...history,
    { role: 'user', content: 'Erkläre mehr!' }
  ];

  const rawRes = await rateLimitedCall(messages, 120);
  return enforceLength(rawRes, 2);
};

// ============================================================================
// � MODE 2: ENTDECKEN (Context-Building Discovery)
// ============================================================================

/**
 * Start Entdecken mode - Phase 1: Context Building
 * 
 * FLOW (8 turns max):
 * Phase 1 (turns 1-2): Context questions - Who? Where? What's happening?
 * Phase 2 (turns 3-5): Narrowing questions - Connect to the word
 * Phase 3 (turns 6-8): Meaning confirmation - MCQ for definition
 */
export const startEntdecken = async (word, sentence, analysis) => {
  // Ensure we have context elements from Architect
  const kontext = analysis.kontext_elemente || {
    ort: 'in der Geschichte',
    charaktere: [],
    aktion: 'etwas passiert',
    relevantes_objekt: null
  };
  
  const prompt = builderPrompts.entdecken.phase1(word, kontext, sentence);

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Starte die Entdeckung.' }
  ];

  const rawRes = await rateLimitedCall(messages, 200);
  let { text, options } = parseResponse(rawRes, word);
  
  // CRITICAL: Ensure we ALWAYS have MCQ options
  if (!options || options.length === 0) {
    const chars = kontext.charaktere || [];
    if (chars.length > 0) {
      options = [chars[0], 'Ein Fremder', 'Niemand'];
    } else {
      options = [kontext.ort || 'Im Wald', 'Zu Hause', 'Im Wasser'];
    }
    options = shuffleArray(options);
  }
  
  return {
    response: enforceLength(text, 2),
    options,
    done: false,
    phase: 1,
    correctAnswers: [],
    analysis
  };
};

/**
 * Continue Entdecken mode
 * CRITICAL: EVERY response MUST include a follow-up question with OPTIONS unless done=true
 */
export const continueEntdecken = async (word, analysis, userAnswer, turn, history, state) => {
  const maxTurns = config.conversation.modes[2].maxTurns;
  
  let { phase, correctAnswers } = state;
  phase = phase || 1;
  correctAnswers = correctAnswers || [];
  
  const kontext = analysis.kontext_elemente || {
    ort: 'in der Geschichte',
    charaktere: [],
    aktion: 'etwas passiert',
    relevantes_objekt: null
  };
  
  // Record this answer
  correctAnswers.push(userAnswer);
  
  // PHASE PROGRESSION based on turn number:
  // Turns 1-2: Phase 1 (Context)
  // Turns 3-5: Phase 2 (Narrowing)
  // Turns 6+: Phase 3 (Confirmation)
  if (turn >= 6) {
    phase = 3;
  } else if (turn >= 3) {
    phase = 2;
  }
  
  // Phase 3: Check for correct meaning answer
  if (phase === 3) {
    const evaluation = evaluateAnswer(userAnswer, analysis.richtig_kurz, [
      analysis.bedeutung, 
      ...(analysis.synonyme || [])
    ]);
    
    if (evaluation.isCorrect) {
      // SUCCESS! Kid understood the word
      const prompt = builderPrompts.entdecken.success(word, analysis.bedeutung);
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Erfolg!' }
      ];
      const rawRes = await rateLimitedCall(messages, 150); // Increased for full success message
      const { text } = parseResponse(rawRes, word);
      
      return {
        response: enforceLength(text, 3), // Allow 3 sentences for celebration
        options: [],
        done: true,
        success: true,
        phase: 3,
        correctAnswers,
        turn
      };
    }
  }
  
  // Check max turns
  if (turn >= maxTurns) {
    const prompt = builderPrompts.entdecken.solution(word, analysis.bedeutung);
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Lösung zeigen.' }
    ];
    const rawRes = await rateLimitedCall(messages, 100);
    const { text } = parseResponse(rawRes, word);
    
    return {
      response: enforceLength(text, 2),
      options: [],
      done: true,
      success: false,
      maxTurnsReached: true,
      phase,
      correctAnswers,
      turn
    };
  }
  
  // Generate next question based on phase
  let prompt;
  let fallbackOptions = [];
  
  if (phase === 1) {
    prompt = builderPrompts.entdecken.phase1(word, kontext, analysis.kontext_bedeutung || '');
    // Fallback MCQ for context questions
    const chars = kontext.charaktere || [];
    fallbackOptions = chars.length > 0 
      ? shuffleArray([chars[0], 'Jemand anderes', 'Niemand'])
      : shuffleArray([kontext.ort || 'Im Wald', 'Zu Hause', 'Woanders']);
  } else if (phase === 2) {
    prompt = builderPrompts.entdecken.phase2(word, kontext, correctAnswers);
    // Fallback MCQ for narrowing questions
    fallbackOptions = shuffleArray([
      kontext.aktion || 'Es passiert etwas',
      'Etwas anderes passiert',
      'Nichts besonderes'
    ]);
  } else {
    // Phase 3 - meaning confirmation
    prompt = builderPrompts.entdecken.phase3(
      word, 
      analysis.bedeutung, 
      kontext, 
      analysis.richtig_kurz, 
      analysis.falsch1, 
      analysis.falsch2
    );
    // Fallback MCQ for meaning
    fallbackOptions = shuffleArray([
      analysis.richtig_kurz,
      analysis.falsch1,
      analysis.falsch2
    ]);
  }
  
  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Kind antwortet: "${userAnswer}". Stelle die nächste Frage.` }
  ];
  
  const rawRes = await rateLimitedCall(messages, 200);
  let { text, options } = parseResponse(rawRes, word, analysis, phase);
  
  // CRITICAL: Ensure we ALWAYS have MCQ options
  if (!options || options.length === 0) {
    options = fallbackOptions;
    console.warn('⚠️ Entdecken: Using fallback options for phase', phase);
  }
  
  // Ensure text ends with a question
  if (!text.includes('?')) {
    text = text + ' Was denkst du?';
  }
  
  return {
    response: enforceLength(text, 3),
    options,
    done: false,
    phase,
    correctAnswers,
    turn
  };
};

// ============================================================================
// 🪞 MODE 3: SYNONYM
// ============================================================================

export const startSynonym = async (word, sentence, analysis) => {
  const synonyme = analysis.synonyme?.length > 0 
    ? analysis.synonyme 
    : ['ähnlich', 'vergleichbar'];
  
  const prompt = builderPrompts.synonym.initial(
    word,
    synonyme,
    analysis.richtig_kurz,
    analysis.falsch1,
    analysis.falsch2
  );

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Zeige Synonyme für "${word}"` }
  ];

  const rawRes = await rateLimitedCall(messages, 150);
  const { text, options } = parseResponse(rawRes, word);
  
  return {
    response: enforceLength(text, 2),
    options,
    done: false,
    analysis
  };
};

export const continueSynonym = async (word, analysis, userAnswer, turn, history) => {
  const maxTurns = config.conversation.modes[3].maxTurns;
  
  // Frontend evaluates the answer
  const evaluation = evaluateAnswer(
    userAnswer, 
    analysis.richtig_kurz, 
    [...(analysis.synonyme || []), analysis.bedeutung]
  );
  
  const prompt = builderPrompts.synonym.followUp(
    word,
    analysis.richtig_kurz,
    evaluation.isCorrect,
    turn,
    maxTurns,
    analysis.falsch1,
    analysis.falsch2
  );

  const messages = [
    { role: 'system', content: prompt },
    ...history,
    { role: 'user', content: `Kind sagt: "${userAnswer}"` }
  ];

  const rawRes = await rateLimitedCall(messages, 150);
  const { text, options, isSuccess, isSolution } = parseResponse(rawRes, word);
  
  const isDone = evaluation.isCorrect || turn >= maxTurns || isSuccess || isSolution;
  
  return {
    response: enforceLength(text, 2),
    options,
    done: isDone,
    success: evaluation.isCorrect || isSuccess,
    maxTurnsReached: turn >= maxTurns || isSolution,
    turn
  };
};

// ============================================================================
// 🧩 MODE 4: WORT-TEILE (Composite Word Breakdown)
// ============================================================================

/**
 * Start composite word mode
 * Phase 1: Ask to find the two parts
 */
export const startWortTeile = async (word, sentence, analysis) => {
  // Ensure we have composite parts
  if (!analysis.teile || analysis.teile.length < 2) {
    // Fallback: try to split the word heuristically
    const midpoint = Math.floor(word.length / 2);
    analysis.teile = [word.slice(0, midpoint), word.slice(midpoint)];
  }
  
  const [teil1, teil2] = analysis.teile;
  
  const prompt = builderPrompts.wortTeile.phase1_initial(word, teil1, teil2);

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Zerlege "${word}"` }
  ];

  const rawRes = await rateLimitedCall(messages, 120);
  const { text, options } = parseResponse(rawRes, word);
  
  return {
    response: enforceLength(text, 2),
    options, // Should be empty for phase 1
    done: false,
    phase: 1,
    foundParts: [],
    analysis
  };
};

/**
 * Continue composite word mode
 * Handles all phases of the conversation
 */
export const continueWortTeile = async (word, analysis, userAnswer, turn, history, state) => {
  const maxTurns = config.conversation.modes[4].maxTurns;
  const [teil1, teil2] = analysis.teile || ['Teil1', 'Teil2'];
  
  let { phase, foundParts } = state;
  foundParts = foundParts || [];
  
  // Phase 1: Finding the parts
  if (phase === 1) {
    const partEval = evaluateCompositePart(userAnswer, teil1, teil2);
    
    if (partEval.foundBoth) {
      // Both parts found! Move to phase 2
      foundParts = [teil1, teil2];
      phase = 2;
      
      const prompt = builderPrompts.wortTeile.phase2_meaning(
        word, teil1, teil2,
        analysis.teil1_bedeutung || 'Bedeutung 1',
        analysis.teil2_bedeutung || 'Bedeutung 2',
        analysis.richtig_kurz,
        analysis.falsch1,
        analysis.falsch2
      );
      
      const messages = [
        { role: 'system', content: prompt },
        ...history,
        { role: 'user', content: `Kind sagt: "${userAnswer}"` }
      ];
      
      const rawRes = await rateLimitedCall(messages, 150);
      const { text, options } = parseResponse(rawRes, word);
      
      return {
        response: enforceLength(text, 2),
        options,
        done: false,
        phase: 2,
        foundParts,
        turn
      };
    }
    
    if (partEval.foundOne) {
      // One part found
      foundParts = partEval.foundParts;
      
      const prompt = builderPrompts.wortTeile.phase1_hint(
        word, teil1, teil2, foundParts[0], turn
      );
      
      const messages = [
        { role: 'system', content: prompt },
        ...history,
        { role: 'user', content: `Kind sagt: "${userAnswer}"` }
      ];
      
      const rawRes = await rateLimitedCall(messages, 120);
      const { text, options } = parseResponse(rawRes, word);
      
      return {
        response: enforceLength(text, 2),
        options,
        done: false,
        phase: 1,
        foundParts,
        turn
      };
    }
    
    // No parts found yet - give a hint
    const prompt = builderPrompts.wortTeile.phase1_hint(word, teil1, teil2, null, turn);
    
    const messages = [
      { role: 'system', content: prompt },
      ...history,
      { role: 'user', content: `Kind sagt: "${userAnswer}"` }
    ];
    
    const rawRes = await rateLimitedCall(messages, 120);
    const { text, options } = parseResponse(rawRes, word);
    
    // Check for max turns in phase 1
    if (turn >= Math.floor(maxTurns / 2)) {
      // Give the parts and move to phase 2
      foundParts = [teil1, teil2];
      phase = 2;
      
      return {
        response: `💭 Die zwei Teile sind **${teil1}** und **${teil2}**! Was bedeutet **${word}** zusammen?`,
        options: shuffleArray([analysis.richtig_kurz, analysis.falsch1, analysis.falsch2]),
        done: false,
        phase: 2,
        foundParts,
        turn
      };
    }
    
    return {
      response: enforceLength(text, 2),
      options,
      done: false,
      phase: 1,
      foundParts,
      turn
    };
  }
  
  // Phase 2: Understanding the meaning
  const evaluation = evaluateAnswer(userAnswer, analysis.richtig_kurz, [analysis.bedeutung]);
  
  if (evaluation.isCorrect) {
    const prompt = builderPrompts.wortTeile.success(word, analysis.bedeutung);
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Erfolg!' }
    ];
    
    const rawRes = await rateLimitedCall(messages, 100);
    const { text } = parseResponse(rawRes, word);
    
    return {
      response: enforceLength(text, 2),
      options: [],
      done: true,
      success: true,
      phase: 2,
      foundParts,
      turn
    };
  }
  
  // Max turns reached
  if (turn >= maxTurns) {
    const prompt = builderPrompts.wortTeile.solution(word, teil1, teil2, analysis.bedeutung);
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Lösung bitte' }
    ];
    
    const rawRes = await rateLimitedCall(messages, 100);
    const { text } = parseResponse(rawRes, word);
    
    return {
      response: enforceLength(text, 2),
      options: [],
      done: true,
      success: false,
      maxTurnsReached: true,
      phase: 2,
      foundParts,
      turn
    };
  }
  
  // Wrong answer in phase 2
  return {
    response: `🤔 Fast! Denk nochmal: **${teil1}** (${analysis.teil1_bedeutung}) + **${teil2}** (${analysis.teil2_bedeutung}) = ?`,
    options: shuffleArray([analysis.richtig_kurz, analysis.falsch1, analysis.falsch2]),
    done: false,
    phase: 2,
    foundParts,
    turn
  };
};

// ============================================================================
// 🎮 UNIFIED CONVERSATION API (for backwards compatibility)
// ============================================================================

/**
 * Start a conversation (called when user clicks a word)
 */
export const startConversation = async (word, sentence, language, mode) => {
  // Cancel any pending requests
  requestManager.cancelPending();
  
  // Get word analysis from the Architect
  const analysis = await analyzeWord(word, sentence);
  const sessionId = `s-${Date.now()}`;
  
  let result;
  
  switch (mode) {
    case 1: // Erklären
      result = await startErklaeren(word, sentence, analysis);
      break;
    case 2: // Entdecken (was Rätsel)
      result = await startEntdecken(word, sentence, analysis);
      break;
    case 3: // Synonym
      result = await startSynonym(word, sentence, analysis);
      break;
    case 4: // Wort-Teile
      result = await startWortTeile(word, sentence, analysis);
      break;
    default:
      result = await startErklaeren(word, sentence, analysis);
  }
  
  return {
    question: result.response,
    sessionId,
    done: result.done || false,
    options: result.options || [],
    analysis: result.analysis || analysis,
    phase: result.phase,
    foundParts: result.foundParts,
    correctAnswers: result.correctAnswers
  };
};

/**
 * Continue a conversation (called when user submits an answer)
 */
export const continueConversation = async (word, sentence, language, mode, turn, userAnswer, history, analysis, state = {}) => {
  let result;
  
  switch (mode) {
    case 1: // Erklären - should use explainMore instead
      result = {
        response: await explainMore(word, sentence, analysis, history),
        done: true,
        options: []
      };
      break;
    case 2: // Entdecken (was Rätsel)
      result = await continueEntdecken(word, analysis, userAnswer, turn, history, state);
      break;
    case 3: // Synonym
      result = await continueSynonym(word, analysis, userAnswer, turn, history);
      break;
    case 4: // Wort-Teile
      result = await continueWortTeile(word, analysis, userAnswer, turn, history, state);
      break;
    default:
      result = { response: 'Unbekannter Modus', done: true, options: [] };
  }
  
  return {
    feedback: result.response,
    definition: result.response,
    done: result.done || false,
    success: result.success || false,
    maxTurnsReached: result.maxTurnsReached || false,
    turn: result.turn || turn,
    options: result.options || [],
    phase: result.phase,
    foundParts: result.foundParts,
    correctAnswers: result.correctAnswers
  };
};
