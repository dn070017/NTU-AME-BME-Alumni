import { EyeOff, GripVertical, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, uploadImage } from '../../lib/client/upload';

export type ProductRow = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageKey: string | null;
  visible: boolean;
};

type Draft = Omit<ProductRow, 'id' | 'price'> & { id?: number; price: string };

const EMPTY: Draft = { name: '', description: '', price: '', imageKey: null, visible: true };
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const formatPrice = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

export default function ProductManager({ products: initial }: { products: ProductRow[] }) {
  const [products, setProducts] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setError(null);
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3000);
  };

  async function saveOrder(list: ProductRow[]) {
    try {
      await apiFetch('/api/admin/products/order', { method: 'PUT', json: { ids: list.map((p) => p.id) } });
      flash('已更新陳列順序');
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function moveBefore(targetId: number) {
    if (dragId == null || dragId === targetId) return;
    setProducts((list) => {
      const copy = [...list];
      const [item] = copy.splice(copy.findIndex((p) => p.id === dragId), 1);
      copy.splice(copy.findIndex((p) => p.id === targetId), 0, item);
      return copy;
    });
    setOrderDirty(true);
  }

  async function remove(p: ProductRow) {
    if (!window.confirm(`確定要刪除「${p.name}」？商品圖片也會一併刪除，無法復原。`)) return;
    try {
      await apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      setProducts((list) => list.filter((x) => x.id !== p.id));
      flash('已刪除');
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function onSaved(row: ProductRow, isNew: boolean) {
    setProducts((list) => (isNew ? [...list, row] : list.map((p) => (p.id === row.id ? row : p))));
    setDraft(null);
    flash(isNew ? '已新增商品' : '已儲存變更');
  }

  return (
    <div className="products-admin">
      <div className="admin-head">
        <h1>商品贊助</h1>
        <button type="button" className="btn btn--solid" onClick={() => setDraft({ ...EMPTY })}>
          <Plus size={16} /> 新增商品
        </button>
      </div>

      {error && <p className="editor__error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {products.length > 1 && <p className="products-admin__hint">拖曳卡片可調整前台陳列順序。</p>}

      {products.length === 0 ? (
        <div className="table-wrap">
          <p className="empty">尚無商品，點選「新增商品」開始。</p>
        </div>
      ) : (
        <ul className="pcards">
          {products.map((p) => (
            <li
              key={p.id}
              className={`pcard${dragId === p.id ? ' is-dragging' : ''}${p.visible ? '' : ' is-hidden'}`}
              draggable
              onDragStart={(e) => {
                setDragId(p.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnter={() => moveBefore(p.id)}
              onDragOver={(e) => dragId != null && e.preventDefault()}
              onDragEnd={() => {
                setDragId(null);
                if (orderDirty) {
                  setOrderDirty(false);
                  saveOrder(products);
                }
              }}
            >
              <span className="pcard__grip" aria-hidden="true">
                <GripVertical size={16} />
              </span>
              <div className="pcard__img">
                {p.imageKey ? <img src={`/media/${p.imageKey}`} alt="" draggable={false} /> : <span>無圖片</span>}
              </div>
              <div className="pcard__body">
                <strong>{p.name}</strong>
                <span className="pcard__price">{formatPrice(p.price)}</span>
                {!p.visible && (
                  <span className="badge badge--draft">
                    <EyeOff size={11} /> 未上架
                  </span>
                )}
              </div>
              <div className="pcard__actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setDraft({ ...p, description: p.description ?? '', price: String(p.price) })}
                >
                  <Pencil size={14} /> 編輯
                </button>
                <button type="button" className="link-btn link-btn--danger" onClick={() => remove(p)}>
                  <Trash2 size={14} /> 刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && <ProductDialog draft={draft} onClose={() => setDraft(null)} onSaved={onSaved} />}
    </div>
  );
}

function ProductDialog({
  draft: initial,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (row: ProductRow, isNew: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNew = draft.id == null;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      const { key } = await uploadImage(file, 'products', 1200);
      setDraft((d) => ({ ...d, imageKey: key }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(draft.price);
    if (!Number.isInteger(price) || price < 0) return setError('價格需為 0 以上的整數');
    setBusy('save');
    setError(null);
    const payload = { name: draft.name, description: draft.description, price, imageKey: draft.imageKey, visible: draft.visible };
    try {
      const row = isNew
        ? await apiFetch<ProductRow>('/api/admin/products', { method: 'POST', json: payload })
        : await apiFetch<ProductRow>(`/api/admin/products/${draft.id}`, { method: 'PUT', json: payload });
      onSaved(row, isNew);
    } catch (err) {
      setError(errMsg(err));
      setBusy(null);
    }
  }

  return (
    <dialog ref={ref} className="pdialog" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form onSubmit={submit}>
        <h2>{isNew ? '新增商品' : '編輯商品'}</h2>

        <div className="pdialog__grid">
          <div className="pdialog__image">
            <button type="button" className="pdialog__pick" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              {draft.imageKey ? (
                <img src={`/media/${draft.imageKey}`} alt="商品圖片預覽" />
              ) : (
                <span>
                  <ImagePlus size={22} />
                  上傳商品圖片
                </span>
              )}
            </button>
            <div className="pdialog__image-actions">
              {busy === 'upload' ? (
                <span>上傳中…</span>
              ) : (
                draft.imageKey && (
                  <>
                    <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
                      更換
                    </button>
                    <button type="button" className="link-btn link-btn--danger" onClick={() => setDraft({ ...draft, imageKey: null })}>
                      移除
                    </button>
                  </>
                )
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          </div>

          <div className="pdialog__fields">
            <label className="field">
              <span>商品名稱</span>
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
            </label>
            <label className="field">
              <span>價格（新台幣）</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>商品敘述</span>
              <textarea
                rows={5}
                value={draft.description ?? ''}
                placeholder="材質、尺寸、款式等說明"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="field field--check">
              <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} />
              <span>上架顯示</span>
            </label>
          </div>
        </div>

        {error && <p className="doc-form__error" role="alert">{error}</p>}

        <div className="pdialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()} disabled={busy !== null}>
            取消
          </button>
          <button type="submit" className="btn btn--solid" disabled={busy !== null}>
            {busy === 'save' ? '儲存中…' : isNew ? '新增商品' : '儲存變更'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
