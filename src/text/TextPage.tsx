import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Code, Heading1, Heading2, Italic, List, ListChecks, ListOrdered, Strikethrough } from "lucide-react";
import { PAGE_SIZE, type TextPage as TP } from "../store/schema";
import { updatePage } from "../store/pages";
import "./text.css";

const SAVE_MS = 400;
const I = { size: 14, strokeWidth: 1.5 } as const;

export function TextPage({ page, width }: { page: TP; width: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true })],
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
          <button className="btn ghost icon" aria-label="Strike" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough {...I} /></button>
          <button className="btn ghost icon" aria-label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 {...I} /></button>
          <button className="btn ghost icon" aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 {...I} /></button>
          <button className="btn ghost icon" aria-label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List {...I} /></button>
          <button className="btn ghost icon" aria-label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered {...I} /></button>
          <button className="btn ghost icon" aria-label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks {...I} /></button>
          <button className="btn ghost icon" aria-label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code {...I} /></button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
