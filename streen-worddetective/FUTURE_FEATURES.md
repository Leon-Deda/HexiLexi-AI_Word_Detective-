Some goals and ideas for the future of HexiLexi.

## Development/Technical Goals:
1. Refactor the code: split App.js (very large incoherent file) into smaller, readable components (ChatPanel, ControlsPanel, etc) for easier editing and updating of HexiLexi.
2. Improve State Management Library: using useState can become cumbersome, implementing Redux Toolkit or Yustand can centralize the application's state, making it easier to manage and add features.
3. Adding Integration and Unit Tests: using React Testing Library with Jest, we can write automated scripts to test components of the apps to ensure new features or edits do not break anything.
4. Make HexiLexi more accessible for disabilities by introducing ARIA attributes to interactive elements.

### 1. The Magic Shop (Spend those Points!)
*   **Concept:** Right now, points just go up. Let kids **spend** them!
*   **Implementation:** A "Witch's Market" where they can buy accessories for their Cat Avatar (hats, glasses, scarves) or decorations for the chat interface (new bubble styles, different wand cursors).

### 2. Achievement Badges (Stickers)
*   **Concept:** Beyond levels, give specific badges for behaviors.
*   **Examples:** 
    *   "Night Owl" (playing after 8 PM)
    *   "Speedy Caster" (fast answers)
    *   "Bookworm" (50 words learned)
    *   "Streak Master" (7 days in a row)

### 3. Pronunciation "Spell Casting"
*   **Concept:** A mode where the user *must* speak the word correctly to "cast" it.
*   **Mechanic:** Use the speech recognition to check if they pronounced the target word correctly. If yes -> Visual explosion!

### 4. Word Relationships (The Web)
*   **Concept:** Visualizing how language connects.
*   **Implementation:** In the Dictionary, show a visual web. If they learned "Tree", show lines connecting it to "Leaf" or "Forest" if they learn those later.

### 5. AI Image Generation (The Crystal Ball)
*   **Concept:** Visual rewards for learning.
*   **Implementation:** When a user successfully learns a word, use an image generation API (like DALL-E or Stable Diffusion) to generate a unique "card" for that word in the style of a tarot card. This becomes the image in their Dictionary.

### 6. Atmospheric Soundscapes
*   **Concept:** Dynamic audio immersion.
*   **Implementation:** If the sentence is about a forest, play subtle bird/wind sounds. If it's about a city, play car sounds. Add magical chimes for correct answers and a "poof" sound for wrong ones.

### 7. Story Mode (Campaign)
*   **Concept:** A continuous narrative instead of random sentences.
*   **Plot:** HexiLexi has lost her spellbook pages. Each "Level" is a chapter. You have to find the "Key Words" in the text to unlock the next chapter.

### 8. "Spellcrafting" (Creative Output)
*   **Concept:** A mini-game using learned words.
*   **Mechanic:** Kids drag-and-drop words they have learned to create funny sentences ("Spells").
    *   *Example:* "The [Grumpy] [Cat] [Dances]." -> The app animates a cat dancing.

### 9. Dyslexia Support
*   **Concept:** Making reading easier for everyone.
*   **Implementation:** 
    *   A toggle to switch the font to **OpenDyslexic**.
    *   A "Ruler" mode that highlights only the current line of text being read to help focus.

### 10. TTS Support
*   **Concept:** Add TTS support to provide HexiLexi a voice.
*   **Implementation:**
    *   A button for HexiLexi to speak the latest sentence.
    *   Focus on emphasis, word dynamics, non-static voice.