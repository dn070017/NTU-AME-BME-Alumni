import { ArrowLeft, ExternalLink, ImagePlus, Star, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, photoVariants } from '../../lib/client/upload';

type Photo = { id: number; key: string; thumbKey: string; width: number; height: number };

type Props = {
  album: {
    id?: number;
    title: string;
    description: string | null;
    published: boolean;
    publishedAt: string; // YYYY-MM-DD
    coverPhotoId: number | null;
  };
  photos: Photo[];
};

type Job = { uid: number; name: string; state: 'waiting' | 'processing' | 'uploading' | 'error'; error?: string };

const CONCURRENCY = 3;
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
let jobUid = 0;

export default function AlbumEditor({ album, photos: initialPhotos }: Props) {
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? '');
  const [publishedAt, setPublishedAt] = useState(album.publishedAt);
  const [published, setPublished] = useState(album.published);
  const [coverPhotoId, setCoverPhotoId] = useState(album.coverPhotoId);
  const [photos, setPhotos] = useState(initialPhotos);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isNew = album.id == null;
  const busy = jobs.some((j) => j.state !== 'error');

  const touch = () => {
    setDirty(true);
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    const payload = { title, description, publishedAt, published, coverPhotoId, photoOrder: photos.map((p) => p.id) };
    try {
      if (isNew) {
        const { id } = await apiFetch<{ id: number }>('/api/admin/albums', { method: 'POST', json: payload });
        setDirty(false);
        window.location.replace(`/admin/gallery/${id}?created=1`);
        return;
      }
      await apiFetch(`/api/admin/albums/${album.id}`, { method: 'PUT', json: payload });
      setDirty(false);
      setMessage({ kind: 'ok', text: '已儲存' });
    } catch (err) {
      setMessage({ kind: 'error', text: errMsg(err) });
    } finally {
      setSaving(false);
    }
  }

  async function removeAlbum() {
    if (!window.confirm(`確定要刪除相簿「${title}」與其中 ${photos.length} 張照片？無法復原。`)) return;
    try {
      await apiFetch(`/api/admin/albums/${album.id}`, { method: 'DELETE' });
      setDirty(false);
      window.location.replace('/admin/gallery?deleted=1');
    } catch (err) {
      setMessage({ kind: 'error', text: errMsg(err) });
    }
  }

  async function removePhoto(photo: Photo) {
    if (!window.confirm('確定要刪除這張照片？')) return;
    try {
      await apiFetch(`/api/admin/photos/${photo.id}`, { method: 'DELETE' });
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
      if (coverPhotoId === photo.id) setCoverPhotoId(null);
    } catch (err) {
      setMessage({ kind: 'error', text: errMsg(err) });
    }
  }

  /**
   * 批次上傳：每張照片在瀏覽器端轉成大圖與縮圖（同時最多 3 張壓縮），
   * 上傳則依選取順序逐張進行，讓照片排序與選取順序一致。
   */
  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    const newJobs = files.map((f) => ({ uid: ++jobUid, name: f.name, state: 'waiting' as const }));
    setJobs((list) => [...list, ...newJobs]);
    const update = (uid: number, patch: Partial<Job>) => setJobs((list) => list.map((j) => (j.uid === uid ? { ...j, ...patch } : j)));

    let active = 0;
    const waiting: (() => void)[] = [];
    const acquire = () => new Promise<void>((resolve) => (active < CONCURRENCY ? (active++, resolve()) : waiting.push(resolve)));
    const release = () => {
      const nextJob = waiting.shift();
      if (nextJob) nextJob();
      else active--;
    };

    const compressed = files.map(async (file, i) => {
      await acquire();
      try {
        update(newJobs[i].uid, { state: 'processing' });
        return await photoVariants(file);
      } finally {
        release();
      }
    });
    compressed.forEach((p) => p.catch(() => {})); // 錯誤於下方依序處理

    for (const [i, job] of newJobs.entries()) {
      try {
        const { large, thumb } = await compressed[i];
        update(job.uid, { state: 'uploading' });
        const form = new FormData();
        form.append('large', large.blob, 'large.webp');
        form.append('thumb', thumb.blob, 'thumb.webp');
        form.append('width', String(large.width));
        form.append('height', String(large.height));
        const photo = await apiFetch<Photo>(`/api/admin/albums/${album.id}/photos`, { method: 'POST', body: form });
        setPhotos((list) => [...list, photo]);
        setJobs((list) => list.filter((j) => j.uid !== job.uid));
      } catch (err) {
        update(job.uid, { state: 'error', error: errMsg(err) });
      }
    }
  }

  /** 拖曳排序：把 dragId 移到 targetId 的位置 */
  function moveBefore(targetId: number) {
    if (dragId == null || dragId === targetId) return;
    setPhotos((list) => {
      const from = list.findIndex((p) => p.id === dragId);
      const to = list.findIndex((p) => p.id === targetId);
      const copy = [...list];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    touch();
  }

  useEffect(() => {
    if (new URLSearchParams(location.search).get('created')) {
      setMessage({ kind: 'ok', text: '相簿已建立，現在可以上傳照片。' });
      history.replaceState(null, '', location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, busy]);

  const effectiveCover = coverPhotoId ?? photos[0]?.id;

  return (
    <div className="editor album-editor">
      <div className="editor__bar">
        <a className="editor__back" href="/admin/gallery">
          <ArrowLeft size={16} /> 精彩點滴
        </a>
        <div className="editor__actions">
          {dirty && <span className="editor__status">尚未儲存</span>}
          {message?.kind === 'ok' && !dirty && <span className="editor__status editor__status--ok">{message.text}</span>}
          {!isNew && (
            <a className="btn btn--ghost" href={`/gallery/${album.id}`} target="_blank" rel="noopener">
              <ExternalLink size={16} /> 檢視
            </a>
          )}
          <button className="btn btn--solid" type="button" onClick={save} disabled={saving}>
            {saving ? '儲存中…' : isNew ? '建立相簿' : '儲存變更'}
          </button>
        </div>
      </div>

      {message?.kind === 'error' && (
        <p className="editor__error" role="alert">
          {message.text}
        </p>
      )}

      <input
        className="editor__title"
        type="text"
        placeholder="相簿標題，例如：2026 系友大會"
        aria-label="相簿標題"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          touch();
        }}
      />

      <div className="album-editor__meta">
        <label className="field">
          <span>活動日期</span>
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
        <label className="field album-editor__desc">
          <span>說明（選填）</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              touch();
            }}
          />
        </label>
      </div>

      {isNew ? (
        <p className="album-editor__hint">建立相簿後即可批次上傳照片。</p>
      ) : (
        <section className="album-editor__photos" aria-label="照片">
          <div className="album-editor__photos-head">
            <h2>
              照片 <small>{photos.length} 張</small>
            </h2>
            <p>拖曳照片可調整順序，排序與封面變更需按「儲存變更」。</p>
          </div>

          <div
            className={`dropzone dropzone--photos${dragOver ? ' is-over' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          >
            <ImagePlus size={22} />
            <span>點選或拖曳照片到這裡（可一次選取多張）</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {jobs.length > 0 && (
            <ul className="jobs">
              {jobs.map((j) => (
                <li key={j.uid} className={`jobs__item jobs__item--${j.state}`}>
                  <span className="jobs__name">{j.name}</span>
                  <span className="jobs__state">
                    {j.state === 'waiting' && '等待中'}
                    {j.state === 'processing' && '壓縮中…'}
                    {j.state === 'uploading' && '上傳中…'}
                    {j.state === 'error' && j.error}
                  </span>
                  {j.state === 'error' && (
                    <button type="button" className="link-btn" aria-label="移除" onClick={() => setJobs((list) => list.filter((x) => x.uid !== j.uid))}>
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {photos.length > 0 && (
            <ul className="thumbs">
              {photos.map((p) => (
                <li
                  key={p.id}
                  className={`thumbs__item${dragId === p.id ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDragId(p.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnter={() => moveBefore(p.id)}
                  onDragOver={(e) => dragId != null && e.preventDefault()}
                  onDragEnd={() => setDragId(null)}
                >
                  <img src={`/media/${p.thumbKey}`} alt="" loading="lazy" draggable={false} />
                  {effectiveCover === p.id && <span className="thumbs__cover">封面</span>}
                  <div className="thumbs__tools">
                    <button
                      type="button"
                      title="設為封面"
                      aria-label="設為封面"
                      onClick={() => {
                        setCoverPhotoId(p.id);
                        touch();
                      }}
                    >
                      <Star size={15} />
                    </button>
                    <button type="button" title="刪除照片" aria-label="刪除照片" onClick={() => removePhoto(p)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isNew && (
        <div className="editor__danger">
          <button type="button" className="btn btn--danger" onClick={removeAlbum}>
            <Trash2 size={16} /> 刪除相簿
          </button>
        </div>
      )}
    </div>
  );
}
