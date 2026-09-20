import type { Note } from '../../types'
import { RichEditor } from './RichEditor'

interface FreeNoteEditorProps {
  note: Note
  onChange: (content: string) => void
}

/** 自由笔记：空白轻量富文本 */
export function FreeNoteEditor({ note, onChange }: FreeNoteEditorProps) {
  return (
    <div className="note-editor-body">
      <RichEditor
        html={note.content}
        placeholder="自由记录阅读过程中的想法、理解和灵感…"
        onChange={onChange}
      />
    </div>
  )
}
