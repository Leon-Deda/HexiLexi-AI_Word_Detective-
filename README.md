# HexiLexi-AI_Word_Detective-
Hexilexi is an interactive reading app prototype for third-grade children, boosting reading motivation and comprehension through a mascot AI chatbot that helps kids understand meaning. Built as a STREEN AI platform module, it features gamified frontend UI (seasonal themes) with psychologist-designed sessions tested across 4 real-world interactions

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
