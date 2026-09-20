import { formatPrice, formatStock, formatDate } from "../utils";

export default function TrackedList({ products, selectedId, onSelect }) {
  if (products.length === 0) {
    return (
      <section className="section">
        <h2>Tracked Products</h2>
        <p className="msg-empty">No products are being tracked yet.</p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>Tracked Products</h2>
      <div className="tracked-table-wrapper">
        <table className="tracked-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Current Price</th>
              <th>Stock</th>
              <th>Last Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((t) => {
              const latest = t.latest;
              return (
                <tr
                  key={t.id}
                  className={selectedId === t.id ? "row-selected" : ""}
                >
                  <td>{t.products?.name || "—"}</td>
                  <td className="meta">{t.products?.sku || "—"}</td>
                  <td>{latest ? formatPrice(latest.price) : <span className="no-data">No price yet</span>}</td>
                  <td>{latest ? formatStock(latest.stock) : <span className="no-data">—</span>}</td>
                  <td className="meta">{latest ? formatDate(latest.scraped_at) : "—"}</td>
                  <td>
                    <button className="btn-view" onClick={() => onSelect(t.id)}>
                      {selectedId === t.id ? "Viewing" : "View"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
