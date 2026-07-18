import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { act } from "react";
import { MnemonicInput } from "../MnemonicInput";

const PHRASE =
  "test test test test test test test test test test test junk";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function setInputValue(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getInputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll(".mnemonic-input-word"));
}

describe("MnemonicInput — smart paste", () => {
  it("distributes a whole phrase pasted into the first box", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<MnemonicInput onChange={onChange} />));

    await act(async () => setInputValue(getInputs()[0], PHRASE));

    const values = getInputs().map((i) => i.value);
    expect(values).toEqual(PHRASE.split(" "));
    expect(onChange).toHaveBeenLastCalledWith(PHRASE, true);
  });

  it("strips numbering and punctuation from a saved-notes style paste", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<MnemonicInput onChange={onChange} />));

    const numbered = PHRASE.split(" ")
      .map((w, i) => `${i + 1}. ${w}`)
      .join("\n");
    await act(async () => setInputValue(getInputs()[0], numbered));

    expect(getInputs().map((i) => i.value)).toEqual(PHRASE.split(" "));
    expect(onChange).toHaveBeenLastCalledWith(PHRASE, true);
  });

  it("switches to a 24-word grid when a 24-word phrase is pasted", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<MnemonicInput onChange={onChange} />));

    const phrase24 = Array(23).fill("abandon").concat("art").join(" ");
    await act(async () => setInputValue(getInputs()[0], phrase24));

    expect(getInputs().length).toBe(24);
    expect(onChange).toHaveBeenLastCalledWith(phrase24, true);
  });

  it("cleans digits, spaces and punctuation typed into a single box", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<MnemonicInput onChange={onChange} />));

    await act(async () => setInputValue(getInputs()[2], " Te5st! "));

    expect(getInputs()[2].value).toBe("test");
  });

  it("reports incomplete until every box is filled", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<MnemonicInput onChange={onChange} />));

    await act(async () => setInputValue(getInputs()[0], "test"));

    expect(onChange).toHaveBeenLastCalledWith("test", false);
  });
});
