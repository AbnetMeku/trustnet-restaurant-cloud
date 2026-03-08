export function buildSalesExcelRows(data) {
  if (!data || !Array.isArray(data.report)) return [];

  const wsData = [];
  data.report.forEach((category) => {
    wsData.push([category.category]);
    (category.subcategories || []).forEach((subcat) => {
      wsData.push([subcat.name, "Quantity", "Total Amount"]);
      (subcat.items || []).forEach((item) => {
        wsData.push([item.name, item.quantity, item.total_amount]);
      });
      wsData.push([
        `${subcat.name} Total`,
        subcat.total_qty ?? 0,
        subcat.total_amount ?? 0,
      ]);
      wsData.push([]);
    });
    wsData.push([
      `${category.category} Total`,
      category.total_qty ?? 0,
      category.total_amount ?? 0,
    ]);
    wsData.push([]);
  });

  const grandTotal = data.grand_totals?.total_amount ?? 0;
  wsData.push(["Grand Total", "", grandTotal]);

  return wsData;
}
