/**
 * Seed-phrase input as a numbered word grid. Pasting a whole phrase into any
 * box distributes the words across the boxes automatically (12 or 24 words),
 * so phrases copied from notes/files import in one gesture. Space/Enter jumps
 * to the next box; Backspace on an empty box jumps back.
 */

import { useRef, useState } from "react";
import "./MnemonicInput.css";

const WORD_COUNTS = [12, 24] as const;

interface MnemonicInputProps {
  /** Called with the normalized phrase (single-spaced) on every change. */
  onChange: (phrase: string, isComplete: boolean) => void;
  autoFocus?: boolean;
}

/**
 * Extract candidate words from pasted text. BIP-39 English words are pure
 * a-z, so anything else (numbering like "1.", quotes, commas, newlines from
 * saved note files) is treated as a separator and dropped automatically.
 */
function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function MnemonicInput({ onChange, autoFocus }: MnemonicInputProps) {
  const [wordCount, setWordCount] = useState<number>(12);
  const [words, setWords] = useState<string[]>(Array(24).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const emit = (nextWords: string[], count: number) => {
    const active = nextWords.slice(0, count).map((w) => w.trim());
    const phrase = active.filter(Boolean).join(" ");
    onChange(phrase, active.every(Boolean));
  };

  const applyWords = (nextWords: string[], count: number) => {
    setWords(nextWords);
    setWordCount(count);
    emit(nextWords, count);
  };

  const setWordAt = (index: number, value: string) => {
    // Whitespace between characters means a multi-word paste arrived via
    // onChange (some platforms skip the paste event) — distribute it. A
    // digit inside a single typed word (te5st) must NOT split the word.
    if (/\S\s+\S/.test(value) && splitWords(value).length > 1) {
      distribute(value, index);
      return;
    }
    const next = [...words];
    // Seed words are pure a-z: silently drop digits, punctuation, spaces.
    next[index] = value.toLowerCase().replace(/[^a-z]/g, "");
    applyWords(next, wordCount);
  };

  /** Spread pasted words over the grid, starting at `from` (or 0 for a full phrase). */
  const distribute = (text: string, from: number) => {
    const pasted = splitWords(text);
    if (pasted.length === 0) return;

    // A full phrase always starts from box 1; auto-switch 12 <-> 24 layout.
    const isFullPhrase = pasted.length >= 12;
    const start = isFullPhrase ? 0 : from;
    const count = isFullPhrase
      ? (WORD_COUNTS.find((c) => c >= pasted.length) ?? 24)
      : wordCount;

    const next = isFullPhrase ? Array(24).fill("") : [...words];
    pasted.slice(0, 24 - start).forEach((w, i) => {
      next[start + i] = w;
    });
    applyWords(next, count);

    const focusIdx = Math.min(start + pasted.length, count - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  const handlePaste = (index: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (splitWords(text).length > 1) {
      e.preventDefault();
      distribute(text, index);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    const el = e.target as HTMLInputElement;
    if ((e.key === " " || e.key === "Enter") && el.value.trim()) {
      e.preventDefault();
      inputRefs.current[Math.min(index + 1, wordCount - 1)]?.focus();
    } else if (e.key === "Backspace" && !el.value && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  const switchCount = (count: number) => {
    applyWords(words, count);
  };

  return (
    <div className="mnemonic-input">
      <div className="mnemonic-input-toolbar">
        <span className="mnemonic-input-hint">
          Paste your whole phrase into any box — it fills automatically
        </span>
        <div
          className="mnemonic-count-toggle"
          role="radiogroup"
          aria-label="Phrase length"
        >
          {WORD_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={wordCount === count}
              className={`mnemonic-count-option ${wordCount === count ? "active" : ""}`}
              onClick={() => switchCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="mnemonic-input-grid">
        {Array.from({ length: wordCount }, (_, i) => (
          <label key={i} className="mnemonic-input-slot">
            <span className="mnemonic-input-num">{i + 1}</span>
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              className="mnemonic-input-word"
              value={words[i]}
              onChange={(e) => setWordAt(i, e.target.value)}
              onPaste={(e) => handlePaste(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              autoFocus={autoFocus && i === 0}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Word ${i + 1}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default MnemonicInput;
