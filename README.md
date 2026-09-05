# PCAP Practice Test

A simple web app for practicing the PCAP (Certified Associate in Python Programming) exam. No build step, no dependencies — just HTML, CSS, and JavaScript.

**Live app:** https://pcap-test-app.netlify.app

## What it does

The app pulls from a bank of 119 Python questions across four topics (Modules & Packages, Exceptions & Strings, Object-Oriented Programming, and Advanced/Misc), and offers two ways to study:

- **Exam Mode** — simulates the real PCAP exam: 40 questions sampled proportionally across the four topics, a 65-minute countdown timer, and a 70% pass mark. Includes a question palette for jumping between questions and flagging ones to revisit, plus a full results breakdown with a review of every answer at the end.
- **Practice Mode** — works through all 119 questions in random order with instant feedback (correct/incorrect + explanation) after each answer, no timer.

Completed attempts (score, pass/fail, date) are saved to your browser's local storage, so your history is there next time you visit — it's per-browser/device, not synced anywhere.

## Project structure

```
index.html      Page shell / layout for all screens
styles.css       Styling (dark theme)
app.js           App logic — exam/practice flow, scoring, history
questions.js     The question bank
```

## Running it locally

No build tools needed. Just serve the folder with any static file server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment

Deployed on Netlify, connected to this repo for continuous deployment — pushes to `main` deploy automatically.
