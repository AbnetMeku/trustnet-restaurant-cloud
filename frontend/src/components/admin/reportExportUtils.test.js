import { describe, expect, it } from "vitest";
import { buildSalesExcelRows } from "./reportExportUtils";

describe("buildSalesExcelRows", () => {
  it("returns expected rows including subtotals and grand total", () => {
    const input = {
      report: [
        {
          category: "Food",
          total_qty: 5,
          total_amount: 125,
          subcategories: [
            {
              name: "Main",
              total_qty: 5,
              total_amount: 125,
              items: [
                { name: "Injera", quantity: 2, total_amount: 50 },
                { name: "Tibs", quantity: 3, total_amount: 75 },
              ],
            },
          ],
        },
      ],
      grand_totals: { total_amount: 125 },
    };

    const rows = buildSalesExcelRows(input);

    expect(rows[0]).toEqual(["Food"]);
    expect(rows).toContainEqual(["Main", "Quantity", "Total Amount"]);
    expect(rows).toContainEqual(["Injera", 2, 50]);
    expect(rows).toContainEqual(["Main Total", 5, 125]);
    expect(rows).toContainEqual(["Food Total", 5, 125]);
    expect(rows[rows.length - 1]).toEqual(["Grand Total", "", 125]);
  });

  it("returns empty array for invalid input", () => {
    expect(buildSalesExcelRows(null)).toEqual([]);
    expect(buildSalesExcelRows({})).toEqual([]);
  });
});
