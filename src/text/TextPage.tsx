import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  AudioLines, Bold, Code, Columns3, Heading1, Heading2, Heading3, Highlighter, Italic, List, ListChecks, ListOrdered,
  Minus, Palette, Quote, Rows3, Sigma, Strikethrough, Table as TableIcon, Trash2, Underline as UnderlineIcon,
} from "lucide-react";
import { PAGE_SIZE, type TextPage as TP } from "../store/schema";
import { updatePage } from "../store/pages";
import { formatLatexMath, MATH_PRESETS } from "./mathFormat";
import { onRichTextInsert, SpeechNoteModal } from "../notebook/SpeechNoteModal";
import "./text.css";

const SAVE_MS = 400;
const I = { size: 14, strokeWidth: 1.5 } as const;
/** Text colours that read on both papers (brand palette only). */
const TEXT_COLOURS = ["#F5A524", "#3DDC97", "#4FD1C5", "#5BB8FF", "#FF8A5B", "#FF6B6B"];

interface SlashItem {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  run: (ed: Editor, openMath: () => void, openVoice: () => void) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "Heading 1", hint: "Large section title", keywords: "h1 heading title", run: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "Medium subsection", keywords: "h2 subheading", run: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "Compact heading", keywords: "h3 small", run: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "todo", label: "Task checklist", hint: "Interactive to-do items", keywords: "todo task check list", run: (ed) => ed.chain().focus().toggleTaskList().run() },
  { id: "bullet", label: "Bullet list", hint: "Unordered list", keywords: "bullet ul list", run: (ed) => ed.chain().focus().toggleBulletList().run() },
  { id: "num", label: "Numbered list", hint: "Ordered steps", keywords: "numbered ol steps", run: (ed) => ed.chain().focus().toggleOrderedList().run() },
  { id: "voice", label: "Voice dictation (Sarvam AI)", hint: "Speech-to-text note in Indic / English", keywords: "voice speech dictate sarvam audio mic", run: (_ed, _openMath, openVoice) => openVoice() },
  { id: "math", label: "Math equation", hint: "LaTeX -> crisp scientific symbols", keywords: "math equation formula latex sigma integral", run: (_ed, openMath) => openMath() },
  { id: "callout", label: "Callout / Theorem", hint: "Highlighted theorem or key note", keywords: "callout quote theorem note", run: (ed) => ed.chain().focus().toggleBlockquote().run() },
  { id: "table", label: "Table (3x3)", hint: "Structured rows & columns", keywords: "table grid matrix", run: (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "code", label: "Code block", hint: "Monospace snippet", keywords: "code snippet pre", run: (ed) => ed.chain().focus().toggleCodeBlock().run() },
  { id: "hr", label: "Divider line", hint: "Horizontal section rule", keywords: "hr divider rule line", run: (ed) => ed.chain().focus().setHorizontalRule().run() },
];

function detectSlashQuery(ed: Editor): { from: number; to: number; query: string } | null {
  const { selection } = ed.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const m = /(?:^|\s)\/([a-zA-Z0-9]*)$/.exec(textBefore);
  if (!m) return null;
  const slashOffset = m.index + (m[0].startsWith("/") ? 0 : 1);
  const blockStart = $from.start();
  return { from: blockStart + slashOffset, to: selection.from, query: m[1].toLowerCase() };
}

export function TextPage({ page, width }: { page: TP; width: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [colours, setColours] = useState(false);
  const [slash, setSlash] = useState<{ from: number; to: number; query: string; idx: number } | null>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [mathLatex, setMathLatex] = useState("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}");
  const [mathBlock, setMathBlock] = useState(false);

  const slashRef = useRef(slash);
  slashRef.current = slash;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true }),
      Underline, TextStyle, Color, Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    ],
    content: (page.doc as object | null) ?? "",
    editorProps: {
      attributes: { class: "text-doc", "aria-label": "Text page" },
      handleKeyDown: (_view, event) => {
        const cur = slashRef.current;
        if (!cur) return false;
        const matches = SLASH_ITEMS.filter((it) =>
          !cur.query || it.label.toLowerCase().includes(cur.query) || it.keywords.includes(cur.query),
        );
        if (matches.length === 0) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlash((s) => s ? { ...s, idx: (s.idx + 1) % matches.length } : null);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlash((s) => s ? { ...s, idx: (s.idx - 1 + matches.length) % matches.length } : null);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSlash(null);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const chosen = matches[cur.idx] ?? matches[0];
          if (chosen && editorRef.current) {
            editorRef.current.chain().focus().deleteRange({ from: cur.from, to: cur.to }).run();
            setSlash(null);
            chosen.run(editorRef.current, () => setMathOpen(true), () => setVoiceOpen(true));
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const sq = detectSlashQuery(ed);
      setSlash((prev) => sq ? { ...sq, idx: prev && prev.query === sq.query ? prev.idx : 0 } : null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void updatePage(page.id, { doc: ed.getJSON() }); }, SAVE_MS);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const sq = detectSlashQuery(ed);
      if (!sq) setSlash(null);
    },
    onFocus: () => setFocused(true),
    onBlur: ({ editor: ed }) => {
      setFocused(false);
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      void updatePage(page.id, { doc: ed.getJSON() });
    },
  }, [page.id]);

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // what is switched on where the cursor is (or for the selection), so the toolbar shows it
  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive("bold"), italic: !!ed?.isActive("italic"), underline: !!ed?.isActive("underline"),
      strike: !!ed?.isActive("strike"), highlight: !!ed?.isActive("highlight"),
      h1: !!ed?.isActive("heading", { level: 1 }), h2: !!ed?.isActive("heading", { level: 2 }), h3: !!ed?.isActive("heading", { level: 3 }),
      bullet: !!ed?.isActive("bulletList"), ordered: !!ed?.isActive("orderedList"), task: !!ed?.isActive("taskList"),
      quote: !!ed?.isActive("blockquote"), code: !!ed?.isActive("codeBlock"),
    }),
  }) ?? {} as Record<string, boolean>;
  /** toolbar button props for a format that can be on or off */
  const fmt = (key: keyof typeof on) => ({ className: `btn ghost icon ${on[key] ? "active" : ""}`, "aria-pressed": !!on[key] });

  useEffect(() => () => {
    if (timer.current && editor) { clearTimeout(timer.current); void updatePage(page.id, { doc: editor.getJSON() }); }
  }, [editor, page.id]);

  // Receive Speech-to-Text inserts targeted at this mounted rich text page
  useEffect(() => onRichTextInsert((targetId, text) => {
    if (targetId !== page.id || !editor) return false;
    const paragraphs = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!paragraphs.length) return true;
    editor.chain().focus().insertContent(
      paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
    ).run();
    void updatePage(page.id, { doc: editor.getJSON() });
    return true;
  }), [editor, page.id]);

  const filteredSlash = useMemo(() => {
    if (!slash) return [];
    return SLASH_ITEMS.filter((it) =>
      !slash.query || it.label.toLowerCase().includes(slash.query) || it.keywords.includes(slash.query),
    );
  }, [slash]);

  const insertFormattedMath = () => {
    if (!editor) return;
    const formatted = formatLatexMath(mathLatex);
    if (!formatted) return;
    if (mathBlock) {
      editor.chain().focus().insertContent({
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "code" }], text: `  ${formatted}  ` }] }],
      }).run();
    } else {
      editor.chain().focus().insertContent({
        type: "text",
        marks: [{ type: "code" }],
        text: formatted,
      }).insertContent(" ").run();
    }
    setMathOpen(false);
  };

  const scale = width / PAGE_SIZE.w;
  return (
    <div className="text-page" style={{ ["--ts" as string]: scale }}>
      {editor && (
        <div className="bubble" role="toolbar" aria-label="Formatting" hidden={!focused && !mathOpen} onMouseDown={(e) => e.preventDefault()}>
          <button {...fmt("bold")} aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold {...I} /></button>
          <button {...fmt("italic")} aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic {...I} /></button>
          <button {...fmt("underline")} aria-label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon {...I} /></button>
          <button {...fmt("strike")} aria-label="Strike" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough {...I} /></button>
          <span className="colour-pick">
            <button className="btn ghost icon" aria-label="Text colour" aria-expanded={colours} onClick={() => setColours((v) => !v)}><Palette {...I} /></button>
            {colours && (
              <span className="colour-pop" role="group" aria-label="Text colours">
                {TEXT_COLOURS.map((c) => (
                  <button key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`}
                    onClick={() => { editor.chain().focus().setColor(c).run(); setColours(false); }} />
                ))}
                <button className="btn ghost" onClick={() => { editor.chain().focus().unsetColor().run(); setColours(false); }}>Default</button>
              </span>
            )}
          </span>
          <button {...fmt("highlight")} aria-label="Highlight" onClick={() => editor.chain().focus().toggleHighlight({ color: "#F2C94C55" }).run()}><Highlighter {...I} /></button>
          <button {...fmt("h1")} aria-label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 {...I} /></button>
          <button {...fmt("h2")} aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 {...I} /></button>
          <button {...fmt("h3")} aria-label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 {...I} /></button>
          <button {...fmt("bullet")} aria-label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List {...I} /></button>
          <button {...fmt("ordered")} aria-label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered {...I} /></button>
          <button {...fmt("task")} aria-label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks {...I} /></button>
          <button {...fmt("quote")} aria-label="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote {...I} /></button>
          <button {...fmt("code")} aria-label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code {...I} /></button>
          <button className="btn ghost icon" aria-label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus {...I} /></button>
          <button className="btn ghost icon" aria-label="Insert math" title="Insert LaTeX math equation (/math)" onClick={() => setMathOpen((v) => !v)}><Sigma {...I} /></button>
          <button className="btn ghost icon" aria-label="Voice dictation" title="Speech-to-Text Note (Sarvam AI / /voice)" onClick={() => setVoiceOpen(true)}><AudioLines {...I} /></button>
          <button className="btn ghost icon" aria-label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon {...I} /></button>
          {editor.isActive("table") && (
            <>
              <button className="btn ghost icon" aria-label="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 {...I} /></button>
              <button className="btn ghost icon" aria-label="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 {...I} /></button>
              <button className="btn ghost" onClick={() => editor.chain().focus().deleteRow().run()}>- row</button>
              <button className="btn ghost" onClick={() => editor.chain().focus().deleteColumn().run()}>- col</button>
              <button className="btn ghost icon" aria-label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 {...I} /></button>
            </>
          )}
        </div>
      )}

      {editor && mathOpen && (
        <div className="math-composer" role="dialog" aria-label="Math equation composer" onMouseDown={(e) => e.stopPropagation()}>
          <div className="math-composer-head">
            <strong className="small">Offline LaTeX Equation</strong>
            <label className="small dim" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={mathBlock} onChange={(e) => setMathBlock(e.target.checked)} />
              Display block
            </label>
          </div>
          <input
            type="text"
            className="input mono"
            aria-label="LaTeX input"
            value={mathLatex}
            onChange={(e) => setMathLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); insertFormattedMath(); }
              if (e.key === "Escape") { e.preventDefault(); setMathOpen(false); }
            }}
            placeholder="e.g. \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}"
          />
          <div className="math-preview" data-testid="math-preview">
            {formatLatexMath(mathLatex) || "Preview appears here"}
          </div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {MATH_PRESETS.map((p) => (
              <button key={p.label} type="button" className="chip" onClick={() => setMathLatex(p.latex)}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button type="button" className="btn ghost" onClick={() => setMathOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={insertFormattedMath}>Insert equation</button>
          </div>
        </div>
      )}

      {editor && slash && filteredSlash.length > 0 && (
        <div className="slash-menu" role="listbox" aria-label="Slash commands" onMouseDown={(e) => e.preventDefault()}>
          {filteredSlash.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={i === slash.idx}
              className={`slash-item ${i === slash.idx ? "on" : ""}`}
              onClick={() => {
                editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
                setSlash(null);
                item.run(editor, () => setMathOpen(true), () => setVoiceOpen(true));
              }}>
              <span className="slash-label">{item.label}</span>
              <span className="slash-hint dim">{item.hint}</span>
            </button>
          ))}
        </div>
      )}

      <EditorContent editor={editor} />
      <SpeechNoteModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        notebookId={page.notebookId}
        currentPage={page}
      />
    </div>
  );
}
