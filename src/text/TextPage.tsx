import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
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
  Bold, Code, Columns3, Heading1, Heading2, Highlighter, Italic, List, ListChecks, ListOrdered, Palette, Rows3,
  Strikethrough, Table as TableIcon, Trash2, Underline as UnderlineIcon,
} from "lucide-react";
import { PAGE_SIZE, type TextPage as TP } from "../store/schema";
import { updatePage } from "../store/pages";
import "./text.css";

const SAVE_MS = 400;
const I = { size: 14, strokeWidth: 1.5 } as const;
/** Text colours that read on both papers (brand palette only). */
const TEXT_COLOURS = ["#F5A524", "#3DDC97", "#4FD1C5", "#5BB8FF", "#FF8A5B", "#FF6B6B"];

export function TextPage({ page, width }: { page: TP; width: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [colours, setColours] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true }),
      Underline, TextStyle, Color, Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    ],
    content: (page.doc as object | null) ?? "",
    editorProps: { attributes: { class: "text-doc", "aria-label": "Text page" } },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void updatePage(page.id, { doc: ed.getJSON() }); }, SAVE_MS);
    },
    onFocus: () => setFocused(true),
    onBlur: ({ editor: ed }) => {
      setFocused(false);
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      void updatePage(page.id, { doc: ed.getJSON() });
    },
  }, [page.id]);

  useEffect(() => () => {
    if (timer.current && editor) { clearTimeout(timer.current); void updatePage(page.id, { doc: editor.getJSON() }); }
  }, [editor, page.id]);

  const scale = width / PAGE_SIZE.w;
  return (
    <div className="text-page" style={{ ["--ts" as string]: scale }}>
      {editor && (
        <div className="bubble" role="toolbar" aria-label="Formatting" hidden={!focused} onMouseDown={(e) => e.preventDefault()}>
          <button className="btn ghost icon" aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold {...I} /></button>
          <button className="btn ghost icon" aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic {...I} /></button>
          <button className="btn ghost icon" aria-label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon {...I} /></button>
          <button className="btn ghost icon" aria-label="Strike" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough {...I} /></button>
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
          <button className="btn ghost icon" aria-label="Highlight" onClick={() => editor.chain().focus().toggleHighlight({ color: "#F2C94C55" }).run()}><Highlighter {...I} /></button>
          <button className="btn ghost icon" aria-label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 {...I} /></button>
          <button className="btn ghost icon" aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 {...I} /></button>
          <button className="btn ghost icon" aria-label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List {...I} /></button>
          <button className="btn ghost icon" aria-label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered {...I} /></button>
          <button className="btn ghost icon" aria-label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks {...I} /></button>
          <button className="btn ghost icon" aria-label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code {...I} /></button>
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
      <EditorContent editor={editor} />
    </div>
  );
}
