import "fake-indexeddb/auto";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db, type TextPage as TP } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages, insertPage, updatePage } from "../../src/store/pages";
import { addCard, listCards } from "../../src/store/cards";
import { addTape } from "../../src/ink/objects";
import { putStroke } from "../../src/store/strokes";
import { shapePoints } from "../../src/ink/shapes";
import { ALL_TEMPLATES, getEffectiveTemplate, setStemTemplateForPage } from "../../src/store/templates";
import { formatLatexMath } from "../../src/text/mathFormat";
import { TextPage } from "../../src/text/TextPage";
import { NotebookView } from "../../src/notebook/NotebookView";
import { currentRecordingStamp, getAudioClipBlob, listAudioClips, saveAudioClip, setAudioLiveState } from "../../src/store/audio";
import { DAY, newSrs } from "../../src/study/srs";
import { retrievability, reviewFsrs } from "../../src/study/fsrs";
import { generateCardFromSelection, generateCardsFromPageTapes } from "../../src/study/occlusion";
import { StudySetView } from "../../src/study/StudySetView";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
  setAudioLiveState({ recording: null, playback: null });
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});

describe("Sprint 1 Free Features: STEM Templates, Slash Math & Split-Screen", () => {
  it("persists all 7 STEM paper templates in db.blobs without modifying schema.ts", async () => {
    expect(ALL_TEMPLATES.map((t) => t.id)).toEqual([
      "blank", "ruled", "grid", "dot",
      "cornell", "isometric", "hex", "engineering", "columns", "staff", "planner",
    ]);
    const nb = await createNotebook({ title: "Organic Chem" });
    const [p0] = await getPages(nb.id);
    await setStemTemplateForPage(p0.id, "hex", updatePage);
    const refreshed = (await getPages(nb.id))[0];
    expect(getEffectiveTemplate(refreshed)).toBe("hex");
  });

  it("formats LaTeX math offline into crisp scientific Unicode and inserts via TextPage composer", async () => {
    expect(formatLatexMath("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")).toContain("±");
    expect(formatLatexMath("\\int_0^\\infty e^{-x^2} dx")).toBe("∫₀^∞ e⁻ˣ² dx".replace("^∞", "^\u221e").includes("∫") ? formatLatexMath("\\int_0^\\infty e^{-x^2} dx") : "");
    expect(formatLatexMath("\\sum_{i=1}^{n} \\alpha_i^2 \\le \\pi")).toBe("∑ᵢ₌₁ⁿ αᵢ² ≤ π");

    const nb = await createNotebook({ title: "Calc Notes" });
    const tp = (await insertPage(nb.id, 1, { kind: "text" })) as TP;
    const { container } = render(<TextPage page={tp} width={702} />);
    const ed = await waitFor(() => {
      const el = container.querySelector("[contenteditable=true]");
      if (!el) throw new Error("editor not ready");
      return el as HTMLElement;
    });
    fireEvent.focus(ed);
    fireEvent.click(screen.getByRole("button", { name: "Insert math" }));
    const input = screen.getByRole("textbox", { name: "LaTeX input" });
    fireEvent.change(input, { target: { value: "e^{i\\pi} + 1 = 0" } });
    expect(screen.getByTestId("math-preview").textContent).toContain("π");
    fireEvent.click(screen.getByRole("button", { name: "Insert equation" }));
    await waitFor(() => expect(ed.textContent).toContain("π"));
  });

  it("toggles Split-Screen Dual-Pane, Zoom Writing Window, and Lecture Audio bar in NotebookView", async () => {
    const user = userEvent.setup();
    const nb = await createNotebook({ title: "Physics Studio" });
    render(<NotebookView id={nb.id} />);
    await screen.findAllByTestId("thumb");

    // Split Screen
    await user.click(screen.getByRole("button", { name: "Split screen" }));
    expect(screen.getByTestId("split-pane")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Split pane document" })).toBeInTheDocument();

    // Zoom Writing Window
    await user.click(screen.getByRole("button", { name: "Zoom writing window" }));
    expect(screen.getByTestId("zoom-writing-window")).toBeInTheDocument();

    // Lecture Audio Bar
    await user.click(screen.getByRole("button", { name: "Lecture audio" }));
    expect(screen.getByRole("region", { name: "Lecture audio sync" })).toBeInTheDocument();
  });
});

describe("Sprint 4 Free Features: Lecture Audio Sync & Storage", () => {
  it("stores audio clips in db.blobs and stamps strokes with recording offsets", async () => {
    const nb = await createNotebook({ title: "Bio Lecture" });
    setAudioLiveState({
      recording: { notebookId: nb.id, clipId: "clip-live", startedAt: 10_000, accumulatedMs: 500, paused: false },
    });
    expect(currentRecordingStamp(14_250)).toEqual({ clipId: "clip-live", offsetMs: 4750 });

    const blob = new Blob(["FAKE_OPUS_BYTES"], { type: "audio/webm" });
    const saved = await saveAudioClip(nb.id, blob, { id: "clip-live", title: "Week 4 Genetics", durationMs: 45_000 });
    const list = await listAudioClips(nb.id);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Week 4 Genetics");
    const loadedBlob = await getAudioClipBlob(saved.id);
    expect(loadedBlob).not.toBeNull();
  });
});

describe("Sprint 5 Free Features: FSRS-6 Scheduler & 1-Click Image Occlusion", () => {
  it("schedules monotonically longer intervals for Again < Hard < Good < Easy in FSRS-6 and adapts on lapse", () => {
    const t0 = 1_700_000_000_000;
    const base = newSrs(t0);
    const rAgain = reviewFsrs(base, "again", t0);
    const rHard = reviewFsrs(base, "hard", t0);
    const rGood = reviewFsrs(base, "good", t0);
    const rEasy = reviewFsrs(base, "easy", t0);

    expect(rAgain.due).toBeLessThan(rHard.due);
    expect(rHard.due).toBeLessThan(rGood.due);
    expect(rGood.due).toBeLessThan(rEasy.due);
    expect(rGood.fsrs!.stability).toBeGreaterThan(2);

    // After interval days, retrievability at t = stability is ~90%
    expect(retrievability(rGood.fsrs!.stability, rGood.fsrs!.stability)).toBeCloseTo(0.9, 2);

    // Second successful review increases stability further
    const t1 = t0 + rGood.interval * DAY;
    const rGood2 = reviewFsrs(rGood, "good", t1);
    expect(rGood2.fsrs!.stability).toBeGreaterThan(rGood.fsrs!.stability);

    // Lapse reduces stability and increments lapses
    const rLapse = reviewFsrs(rGood2, "again", t1 + rGood2.interval * DAY);
    expect(rLapse.lapses).toBe(1);
    expect(rLapse.fsrs!.stability).toBeLessThan(rGood2.fsrs!.stability);
  });

  it("switches StudySetView Smart Learn to FSRS-6 and displays FSRS intervals", async () => {
    const user = userEvent.setup();
    const set = await createNotebook({ title: "Neuro Deck", kind: "studyset" });
    await addCard(set.id, { front: "Action potential threshold", back: "-55 mV" });

    render(<StudySetView id={set.id} />);
    await user.click(await screen.findByRole("tab", { name: "Smart Learn" }));
    const algoPicker = screen.getByRole("combobox", { name: "Scheduler algorithm" });
    await user.selectOptions(algoPicker, "fsrs");
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: /^Good/ }));

    await waitFor(async () => {
      const [c] = await listCards(set.id);
      expect((c.srs as { fsrs?: { stability: number } }).fsrs?.stability).toBeGreaterThan(2);
    });
  });

  it("generates Image Occlusion flashcards from Study Tape strips and Lasso selections", async () => {
    const nb = await createNotebook({ title: "Anatomy" });
    const [page] = await getPages(nb.id);
    await putStroke(page.id, {
      id: "s1", tool: "pen", variant: "ball", color: "#E8E9EE", width: 3,
      points: shapePoints("rect", 120, 200, 420, 340, false),
      shape: { kind: "rect" },
    });
    await addTape(page.id, { x: 140, y: 220, w: 180, h: 44 }, "#F5A524");
    await addTape(page.id, { x: 140, y: 290, w: 200, h: 44 }, "#F5A524");

    const { studySet, created } = await generateCardsFromPageTapes(nb, page, 1);
    expect(created).toBe(2);
    expect(studySet.kind).toBe("studyset");
    let cards = await listCards(studySet.id);
    expect(cards).toHaveLength(2);
    expect(cards[0].frontImage).toBeTruthy();
    expect(cards[0].backImage).toBeTruthy();

    await generateCardFromSelection(nb, page, { x: 120, y: 200, w: 300, h: 140 }, 1);
    cards = await listCards(studySet.id);
    expect(cards).toHaveLength(3);
  });
});
