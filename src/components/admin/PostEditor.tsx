import { ArrowLeft, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, uploadImage } from '../../lib/client/upload';
import RichTextEditor from './RichTextEditor';

type Props = {
  section: string;
  sectionLabel: string;
  type: 'announcement' | 'interview';
  post: {
    id?: number;
    title: string;
    contentHtml: string;
    coverKey: string | null;
    published: boolean;
    publishedAt: string; // YYYY-MM-DD
  };
};

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export default function PostEditor({ section, sectionLabel, type, post }: Props) {
  const [title, setTitle] = useState(post.title);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [published, setPublished] = useState(post.published);
  const [coverKey, setCoverKey] = useState(post.coverKey);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const html = useRef(post.contentHtml);
  const coverInput = useRef<HTMLInputElement>(null);
  const isNew = post.id == null;

  const touch = () => {
    setDirty(true);
    if (status.kind === 'saved') setStatus({ kind: 'idle' });
  };
  const showError = (message: string) => setStatus({ kind: 'error', message });

  const save = useCallback(async () => {
    setStatus({ kind: 'saving' });
    try {
      const payload = { type, title, contentHtml: html.current, coverKey, published, publishedAt };
      if (isNew) {
        const { id } = await apiFetch<{ id: number }>('/api/admin/posts', { method: 'POST', json: payload });
        setDirty(false);
        window.location.replace(`/admin/${section}/${id}?created=1`);
        return;
      }
      await apiFetch(`/api/admin/posts/${post.id}`, { method: 'PUT', json: payload });
      setDirty(false);
      setStatus({ kind: 'saved' });
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [type, title, coverKey, published, publishedAt, isNew, section, post.id]);

  const remove = async () => {
    if (!window.confirm(`確定要刪除「${title || '未命名'}」？文章內的圖片也會一併刪除，無法復原。`)) return;
    try {
      await apiFetch(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
      setDirty(false);
      window.location.replace(`/admin/${section}?deleted=1`);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  };

  const changeCover = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { key } = await uploadImage(file, 'posts');
      setCoverKey(key);
      touch();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  };

  // Ctrl/Cmd + S 儲存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // 有未儲存變更時離開頁面前提醒
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('created')) {
      setStatus({ kind: 'saved' });
      history.replaceState(null, '', location.pathname);
    }
  }, []);

  return (
    <div className="editor">
      <div className="editor__bar">
        <a className="editor__back" href={`/admin/${section}`}>
          <ArrowLeft size={16} /> {sectionLabel}
        </a>
        <div className="editor__actions">
          <StatusText status={status} dirty={dirty} />
          {!isNew && (
            <a className="btn btn--ghost" href={`/${section}/${post.id}`} target="_blank" rel="noopener">
              <ExternalLink size={16} /> 檢視
            </a>
          )}
          <button className="btn btn--solid" type="button" onClick={save} disabled={status.kind === 'saving'}>
            {status.kind === 'saving' ? '儲存中…' : isNew ? '建立文章' : '儲存變更'}
          </button>
        </div>
      </div>

      {status.kind === 'error' && (
        <p className="editor__error" role="alert">
          {status.message}
        </p>
      )}

      <input
        className="editor__title"
        type="text"
        placeholder="文章標題"
        aria-label="文章標題"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          touch();
        }}
      />

      <div className="editor__meta">
        <label className="field">
          <span>上版日期</span>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => {
              setPublishedAt(e.target.value);
              touch();
            }}
          />
        </label>
        <label className="field field--check">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => {
              setPublished(e.target.checked);
              touch();
            }}
          />
          <span>公開顯示</span>
          <small>{published ? '前台可見' : '草稿，前台不顯示'}</small>
        </label>
        <div className="field field--cover">
          <span>封面圖片</span>
          <div className="cover">
            {coverKey ? (
              <img src={`/media/${coverKey}`} alt="" />
            ) : (
              <div className="cover__empty">未設定時使用內文第一張圖片</div>
            )}
            <div className="cover__btns">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => coverInput.current?.click()}>
                <ImagePlus size={14} /> {coverKey ? '更換' : '上傳'}
              </button>
              {coverKey && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setCoverKey(null);
                    touch();
                  }}
                >
                  移除
                </button>
              )}
            </div>
          </div>
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => changeCover(e.target.files?.[0])} />
        </div>
      </div>

      <RichTextEditor
        initialHtml={post.contentHtml}
        uploadFolder="posts"
        onError={showError}
        onChange={(value) => {
          html.current = value;
          touch();
        }}
      />

      {!isNew && (
        <div className="editor__danger">
          <button type="button" className="btn btn--danger" onClick={remove}>
            <Trash2 size={16} /> 刪除文章
          </button>
        </div>
      )}
    </div>
  );
}

function StatusText({ status, dirty }: { status: Status; dirty: boolean }) {
  if (status.kind === 'saved' && !dirty) return <span className="editor__status editor__status--ok">已儲存</span>;
  if (dirty) return <span className="editor__status">尚未儲存</span>;
  return null;
}
