import { ExternalLink, FileUp, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { apiFetch, uploadFileWithProgress } from '../../lib/client/upload';
import { fileSize } from '../../lib/format';

export type DocRow = {
  id: number;
  title: string;
  pdfKey: string;
  pdfSize: number | null;
  published: boolean;
  publishedAt: string; // YYYY-MM-DD
};

type Props = {
  section: string;
  type: 'lecture' | 'resource';
  today: string;
  docs: DocRow[];
};

type Draft = Omit<DocRow, 'id' | 'pdfKey' | 'pdfSize'> & { file: File | null };

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

const titleFromFile = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();

export default function DocManager({ section, type, today, docs: initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (msg: string) => {
    setError(null);
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3000);
  };

  /** 上傳 PDF（如有）並建立或更新資料 */
  async function submit(draft: Draft, existing: DocRow | null, onProgress: (r: number) => void) {
    let pdfKey = existing?.pdfKey;
    let pdfSize = existing?.pdfSize ?? null;
    if (draft.file) {
      const up = await uploadFileWithProgress(draft.file, 'documents', onProgress);
      pdfKey = up.key;
      pdfSize = draft.file.size;
    }
    if (!pdfKey) throw new Error('請選擇 PDF 檔案');
    const payload = { type, title: draft.title, publishedAt: draft.publishedAt, published: draft.published, pdfKey, pdfSize };

    if (existing) {
      await apiFetch(`/api/admin/documents/${existing.id}`, { method: 'PUT', json: payload });
      const row: DocRow = { ...existing, ...payload };
      setDocs((list) => sortDocs(list.map((d) => (d.id === existing.id ? row : d))));
      setEditing(null);
      flash('已儲存變更');
    } else {
      const { id } = await apiFetch<{ id: number }>('/api/admin/documents', { method: 'POST', json: payload });
      setDocs((list) => sortDocs([{ id, ...payload }, ...list]));
      flash('已新增');
    }
  }

  async function remove(doc: DocRow) {
    if (!window.confirm(`確定要刪除「${doc.title}」？PDF 檔案也會一併刪除，無法復原。`)) return;
    try {
      await apiFetch(`/api/admin/documents/${doc.id}`, { method: 'DELETE' });
      setDocs((list) => list.filter((d) => d.id !== doc.id));
      flash('已刪除');
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="docs">
      <DocForm
        key={`new-${docs.length}`}
        heading="新增 PDF"
        submitLabel="上傳並新增"
        initial={{ title: '', publishedAt: today, published: true, file: null }}
        requireFile
        onSubmit={(draft, onProgress) => submit(draft, null, onProgress)}
      />

      {error && <p className="editor__error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="table-wrap">
        {docs.length === 0 ? (
          <p className="empty">尚無資料，請從上方上傳第一份 PDF。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>標題</th>
                <th className="num">上版日期</th>
                <th>狀態</th>
                <th className="num">大小</th>
                <th><span className="visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) =>
                editing === d.id ? (
                  <tr key={d.id}>
                    <td colSpan={5} className="docs__edit-cell">
                      <DocForm
                        heading="編輯"
                        submitLabel="儲存變更"
                        initial={{ title: d.title, publishedAt: d.publishedAt, published: d.published, file: null }}
                        currentFile={`/media/${d.pdfKey}`}
                        onSubmit={(draft, onProgress) => submit(draft, d, onProgress)}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td className="table__title">
                      <a href={`/${section}/${d.id}`} target="_blank" rel="noopener">{d.title}</a>
                    </td>
                    <td className="num">{d.publishedAt.replaceAll('-', '.')}</td>
                    <td>{d.published ? <span className="badge badge--live">公開</span> : <span className="badge badge--draft">草稿</span>}</td>
                    <td className="num">{fileSize(d.pdfSize)}</td>
                    <td className="table__actions">
                      <button type="button" className="link-btn" onClick={() => setEditing(d.id)}>
                        <Pencil size={14} /> 編輯
                      </button>
                      <a href={`/media/${d.pdfKey}`} target="_blank" rel="noopener">
                        <ExternalLink size={14} /> PDF
                      </a>
                      <button type="button" className="link-btn link-btn--danger" onClick={() => remove(d)}>
                        <Trash2 size={14} /> 刪除
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function sortDocs(list: DocRow[]) {
  return [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id - a.id);
}

function DocForm({
  heading,
  submitLabel,
  initial,
  requireFile,
  currentFile,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  initial: Draft;
  requireFile?: boolean;
  currentFile?: string;
  onSubmit: (draft: Draft, onProgress: (r: number) => void) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf') return setError('請選擇 PDF 檔案');
    setError(null);
    // 新增時若尚未輸入標題，以檔名作為預設標題
    setDraft((d) => ({ ...d, file, title: d.title || titleFromFile(file.name) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireFile && !draft.file) return setError('請選擇 PDF 檔案');
    setError(null);
    setProgress(0);
    try {
      await onSubmit(draft, setProgress);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <form className="doc-form" onSubmit={submit}>
      <h2 className="doc-form__h">{heading}</h2>
      <div
        className={`dropzone${dragOver ? ' is-over' : ''}${draft.file ? ' has-file' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <FileUp size={20} />
        {draft.file ? (
          <span>
            {draft.file.name}（{fileSize(draft.file.size)}）
          </span>
        ) : currentFile ? (
          <span>
            點選或拖曳 PDF 以更換檔案（<a href={currentFile} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>目前檔案</a>）
          </span>
        ) : (
          <span>點選或拖曳 PDF 到這裡</span>
        )}
      </div>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => pickFile(e.target.files?.[0])} />

      <div className="doc-form__fields">
        <label className="field doc-form__title">
          <span>標題</span>
          <input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
        </label>
        <label className="field">
          <span>上版日期</span>
          <input type="date" value={draft.publishedAt} onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })} required />
        </label>
        <label className="field field--check">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
          <span>公開顯示</span>
        </label>
      </div>

      {error && <p className="doc-form__error" role="alert">{error}</p>}

      <div className="doc-form__actions">
        {busy && (
          <span className="doc-form__progress">
            {draft.file && progress! < 1 ? `上傳中 ${Math.round(progress! * 100)}%` : '儲存中…'}
          </span>
        )}
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
        )}
        <button type="submit" className="btn btn--solid" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
