import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  Video,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { uploadImage } from '../../lib/client/upload';

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  /** R2 上傳資料夾 */
  uploadFolder: string;
  onError: (message: string) => void;
};

/** 匯入的舊內容可能是裸 <iframe>，Tiptap 的 YouTube 節點需要外層 div[data-youtube-video] */
function normalizeHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('iframe').forEach((iframe) => {
    if (iframe.parentElement?.hasAttribute('data-youtube-video')) return;
    const wrap = doc.createElement('div');
    wrap.setAttribute('data-youtube-video', '');
    iframe.replaceWith(wrap);
    wrap.appendChild(iframe);
  });
  return doc.body.innerHTML;
}

const INITIAL_STATE = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  h2: false,
  h3: false,
  bullet: false,
  ordered: false,
  quote: false,
  link: false,
  canUndo: false,
  canRedo: false,
};

const imageFiles = (files: FileList | File[] | null | undefined) =>
  Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));

export default function RichTextEditor({ initialHtml, onChange, uploadFolder, onError }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  // 貼上/拖曳的 handler 在 useEditor 建立時就綁定，透過 ref 取得 editor
  const editorRef = useRef<Editor | null>(null);

  async function insertImages(editor: Editor, files: File[], pos?: number) {
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const { url } = await uploadImage(file, uploadFolder);
        const chain = editor.chain().focus();
        (pos != null ? chain.insertContentAt(pos, { type: 'image', attrs: { src: url, alt: '' } }) : chain.setImage({ src: url, alt: '' })).run();
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image,
      Youtube.configure({ nocookie: true, modestBranding: true }),
      Placeholder.configure({ placeholder: '開始撰寫內容…可直接貼上或拖曳圖片' }),
    ],
    content: normalizeHtml(initialHtml),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'prose rte__content' },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length || !editorRef.current) return false;
        insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length || !editorRef.current) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImages(editorRef.current, files, pos);
        return true;
      },
    },
  });
  editorRef.current = editor;

  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        quote: e.isActive('blockquote'),
        link: e.isActive('link'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      },
  });

  // useEditorState 在第一次 transaction 前可能仍為 null
  const state = selected ?? INITIAL_STATE;

  // EditorContent 必須一開始就掛載，editor 才會建立；工具列等 editor 就緒後再顯示
  if (!editor) {
    return (
      <div className="rte">
        <div className="rte--loading">編輯器載入中…</div>
        <EditorContent editor={editor} />
      </div>
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('連結網址', prev);
    if (url === null) return;
    if (!url.trim()) return editor.chain().focus().extendMarkRange('link').unsetLink().run();
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addYoutube = () => {
    const url = window.prompt('YouTube 影片網址（例如 https://www.youtube.com/watch?v=...）');
    if (!url) return;
    if (!editor.commands.setYoutubeVideo({ src: url.trim() })) onError('無法辨識的 YouTube 網址');
  };

  const c = () => editor.chain().focus();

  return (
    <div className="rte">
      <div className="rte__toolbar" role="toolbar" aria-label="文字格式">
        <Group>
          <Btn label="大標題" active={state.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></Btn>
          <Btn label="小標題" active={state.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></Btn>
        </Group>
        <Group>
          <Btn label="粗體" active={state.bold} onClick={() => c().toggleBold().run()}><Bold /></Btn>
          <Btn label="斜體" active={state.italic} onClick={() => c().toggleItalic().run()}><Italic /></Btn>
          <Btn label="底線" active={state.underline} onClick={() => c().toggleUnderline().run()}><Underline /></Btn>
          <Btn label="刪除線" active={state.strike} onClick={() => c().toggleStrike().run()}><Strikethrough /></Btn>
        </Group>
        <Group>
          <Btn label="項目清單" active={state.bullet} onClick={() => c().toggleBulletList().run()}><List /></Btn>
          <Btn label="編號清單" active={state.ordered} onClick={() => c().toggleOrderedList().run()}><ListOrdered /></Btn>
          <Btn label="引言" active={state.quote} onClick={() => c().toggleBlockquote().run()}><Quote /></Btn>
          <Btn label="分隔線" onClick={() => c().setHorizontalRule().run()}><Minus /></Btn>
        </Group>
        <Group>
          <Btn label="插入連結" active={state.link} onClick={setLink}><LinkIcon /></Btn>
          {state.link && <Btn label="移除連結" onClick={() => c().unsetLink().run()}><Unlink /></Btn>}
          <Btn label="插入圖片" onClick={() => fileInput.current?.click()}><ImagePlus /></Btn>
          <Btn label="嵌入 YouTube 影片" onClick={addYoutube}><Video /></Btn>
        </Group>
        <Group>
          <Btn label="復原" disabled={!state.canUndo} onClick={() => c().undo().run()}><Undo2 /></Btn>
          <Btn label="重做" disabled={!state.canRedo} onClick={() => c().redo().run()}><Redo2 /></Btn>
        </Group>
        {uploading > 0 && <span className="rte__status">圖片上傳中（{uploading}）…</span>}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages(editor, imageFiles(e.target.files));
          e.target.value = '';
        }}
      />
      <EditorContent editor={editor} />
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="rte__group">{children}</div>;
}

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="rte__btn" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
