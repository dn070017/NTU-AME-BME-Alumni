import { ArrowLeft, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, uploadImage } from '../../lib/client/upload';
import RichTextEditor from './RichTextEditor';

type PostType = 'announcement' | 'news' | 'interview';

type Props = {
  /** 後台管理空間（/admin/<group>） */
  group: string;
  groupLabel: string;
  /** 可發布的單元；超過一個時顯示「發布於」選單 */
  options: readonly { section: string; type: PostType; label: string }[];
  type: PostType;
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

export default function PostEditor({ group, groupLabel, options, type: initialType, post }: Props) {
  const [type, setType] = useState(initialType);
  /** 已儲存的單元，用於「檢視」連結 */
  const [savedType, setSavedType] = useState(initialType);
  const [title, setTitle] = useState(post.title);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [published, setPublished] = useState(post.published);
  const [coverKey, setCoverKey] = useState(post.coverKey);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const html = useRef(post.contentHtml);
  const coverInput = useRef<HTMLInputElement>(null);
  const isNew = post.id == null;
  const sectionOf = (t: PostType) => options.find((o) => o.type === t)!.section;

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
        window.location.replace(`/admin/${group}/${id}?created=1`);
        return;
      }
      await apiFetch(`/api/admin/posts/${post.id}`, { method: 'PUT', json: payload });
      setSavedType(type);
      setDirty(false);
      setStatus({ kind: 'saved' });
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [type, title, coverKey, published, publishedAt, isNew, group, post.id]);

  const remove = async () => {
    if (!window.confirm(`確定要刪除「${title || '未命名'}」？文章內的圖片也會一併刪除，無法復原。`)) return;
    try {
      await apiFetch(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
      setDirty(false);
      window.location.replace(`/admin/${group}?deleted=1`);
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
        <a className="editor__back" href={`/admin/${group}`}>
          <ArrowLeft size={16} /> {groupLabel}
        </a>
        <div className="editor__actions">
          <StatusText status={status} dirty={dirty} />
          {!isNew && (
            <a className="btn btn--ghost" href={`/${sectionOf(savedType)}/${post.id}`} target="_blank" rel="noopener">
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

      <div className={options.length > 1 ? 'editor__meta editor__meta--section' : 'editor__meta'}>
        {options.length > 1 && (
          <label className="field">
            <span>發布於</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as PostType);
                touch();
              }}
            >
              {options.map((o) => (
                <option key={o.type} value={o.type}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
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
