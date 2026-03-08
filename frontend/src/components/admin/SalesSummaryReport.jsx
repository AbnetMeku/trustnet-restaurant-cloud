import React, { useEffect, useMemo, useState } from "react";
import { getSalesSummary } from "@/api/reportApi";
import { getUsers } from "@/api/users";
import Select from "react-select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Loader2 } from "lucide-react";
import { buildSalesExcelRows } from "./reportExportUtils";
import { eatBusinessDateISO } from "@/lib/timezone";

const PDF_THEME = {
  title: [15, 23, 42],
  divider: [245, 158, 11],
  category: [30, 41, 59],
  subcategory: [13, 148, 136],
  tableHeadBg: [15, 23, 42],
  tableHeadText: [248, 250, 252],
  tableBodyText: [30, 41, 59],
  tableAltRow: [248, 250, 252],
  subtotalRow: [254, 243, 199],
  totalBarBg: [2, 6, 23],
  totalBarText: [255, 255, 255],
};

async function applyEthiopicFontIfAvailable(pdf) {
  try {
    const response = await fetch("/fonts/NotoSerifEthiopic-Regular.ttf");
    if (!response.ok) return false;

    const fontArrayBuffer = await response.arrayBuffer();
    const fontBase64 = btoa(
      new Uint8Array(fontArrayBuffer).reduce(
        (acc, byte) => acc + String.fromCharCode(byte),
        ""
      )
    );

    pdf.addFileToVFS("NotoSerifEthiopic-Regular.ttf", fontBase64);
    pdf.addFont("NotoSerifEthiopic-Regular.ttf", "NotoSerifEthiopic", "normal");
    pdf.setFont("NotoSerifEthiopic");
    return true;
  } catch {
    return false;
  }
}

export default function SalesSummaryReport({ darkMode }) {
  const [data, setData] = useState(null);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState(null);

  const today = eatBusinessDateISO();
  const [waiterId, setWaiterId] = useState("");
  const [vipOnly, setVipOnly] = useState("all");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  useEffect(() => {
    async function fetchWaiters() {
      try {
        const waitersData = await getUsers("waiter");
        setWaiters([{ id: "", username: "All Waiters" }, ...waitersData]);
      } catch {
        setWaiters([{ id: "", username: "All Waiters" }]);
      }
    }
    fetchWaiters();
  }, []);

  useEffect(() => {
    async function fetchReportData() {
      setLoading(true);
      setError(null);
      try {
        const vipParam = vipOnly === "all" ? null : vipOnly === "vip";
        const result = await getSalesSummary(
          startDate,
          endDate,
          waiterId === "" ? null : waiterId,
          vipParam
        );
        setData(result);
      } catch (err) {
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchReportData();
  }, [startDate, endDate, waiterId, vipOnly]);

  const hasReportData = useMemo(
    () => !!data && Array.isArray(data.report) && data.report.length > 0,
    [data]
  );
  const waiterOptions = useMemo(
    () =>
      waiters.map((w) => ({
        value: String(w.id ?? ""),
        label: w.username || w.name || "Unknown",
      })),
    [waiters]
  );
  const selectedWaiterOption = useMemo(
    () => waiterOptions.find((opt) => opt.value === String(waiterId)) || waiterOptions[0] || null,
    [waiterId, waiterOptions]
  );
  const selectThemeStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "2.5rem",
        borderRadius: "0.5rem",
        borderColor: state.isFocused ? "#f59e0b" : "#cbd5e1",
        boxShadow: state.isFocused ? "0 0 0 2px rgba(245, 158, 11, 0.25)" : "none",
        backgroundColor: darkMode ? "#0f172a" : "#ffffff",
      }),
      singleValue: (base) => ({
        ...base,
        color: darkMode ? "#f1f5f9" : "#0f172a",
      }),
      input: (base) => ({
        ...base,
        color: darkMode ? "#f1f5f9" : "#0f172a",
      }),
      menu: (base) => ({
        ...base,
        backgroundColor: darkMode ? "#0f172a" : "#ffffff",
        border: `1px solid ${darkMode ? "#334155" : "#e2e8f0"}`,
      }),
      menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
      }),
      menuList: (base) => ({
        ...base,
        maxHeight: 280,
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused
          ? darkMode
            ? "#1e293b"
            : "#f8fafc"
          : darkMode
            ? "#0f172a"
            : "#ffffff",
        color: darkMode ? "#f1f5f9" : "#0f172a",
      }),
      dropdownIndicator: (base, state) => ({
        ...base,
        color: state.isFocused ? "#f59e0b" : darkMode ? "#94a3b8" : "#64748b",
      }),
      clearIndicator: (base) => ({
        ...base,
        color: darkMode ? "#94a3b8" : "#64748b",
      }),
      indicatorSeparator: (base) => ({
        ...base,
        backgroundColor: darkMode ? "#334155" : "#cbd5e1",
      }),
      placeholder: (base) => ({
        ...base,
        color: darkMode ? "#94a3b8" : "#64748b",
      }),
    }),
    [darkMode]
  );

  const buildPdf = async () => {
    if (!hasReportData) {
      throw new Error("No data available for PDF generation.");
    }

    const pdf = new jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 20;
    let yPosition = margin;

    const hasEthiopicFont = await applyEthiopicFontIfAvailable(pdf);
    if (!hasEthiopicFont) {
      pdf.setFont("helvetica", "normal");
    }

    const addNewPageIfNeeded = (requiredHeight) => {
      if (yPosition + requiredHeight > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
    };

    pdf.setFontSize(16);
    pdf.setTextColor(...PDF_THEME.title);
    pdf.text(`Sales Summary: ${data.from} - ${data.to}`, margin, yPosition);
    pdf.setLineWidth(1);
    pdf.setDrawColor(...PDF_THEME.divider);
    pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
    yPosition += lineHeight * 2;

    data.report.forEach((category) => {
      addNewPageIfNeeded(lineHeight);
      pdf.setFontSize(14);
      pdf.setTextColor(...PDF_THEME.category);
      pdf.text(category.category, margin, yPosition);
      yPosition += lineHeight + 10;

      category.subcategories.forEach((subcat) => {
        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(12);
        pdf.setTextColor(...PDF_THEME.subcategory);
        pdf.text(subcat.name, margin + 20, yPosition);
        yPosition += lineHeight + 5;

        const tableData = subcat.items.map((item) => [
          item.name,
          item.vip_status,
          String(item.quantity),
          Number(item.average_price || 0).toFixed(2),
          Number(item.total_amount || 0).toFixed(2),
        ]);

        tableData.push([
          `Subtotal for ${subcat.name}`,
          "",
          String(subcat.total_qty),
          "",
          Number(subcat.total_amount || 0).toFixed(2),
        ]);

        addNewPageIfNeeded(100);
        autoTable(pdf, {
          startY: yPosition,
          head: [["Item", "VIP Status", "Quantity", "Unit Price", "Total"]],
          body: tableData,
          theme: "grid",
          headStyles: {
            fillColor: PDF_THEME.tableHeadBg,
            textColor: PDF_THEME.tableHeadText,
            font: hasEthiopicFont ? "NotoSerifEthiopic" : "helvetica",
            fontStyle: "normal",
          },
          bodyStyles: {
            textColor: PDF_THEME.tableBodyText,
            font: hasEthiopicFont ? "NotoSerifEthiopic" : "helvetica",
            fontStyle: "normal",
          },
          alternateRowStyles: {
            fillColor: PDF_THEME.tableAltRow,
          },
          margin: { left: margin + 20, right: margin },
          styles: {
            fontSize: 10,
            font: hasEthiopicFont ? "NotoSerifEthiopic" : "helvetica",
            cellPadding: 8,
          },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 80 },
            2: { cellWidth: 60, halign: "right" },
            3: { cellWidth: 60, halign: "right" },
            4: { cellWidth: 80, halign: "right" },
          },
          didParseCell: (hookData) => {
            if (hookData.section !== "body") return;
            if (hookData.row.index !== tableData.length - 1) return;
            hookData.cell.styles.fillColor = PDF_THEME.subtotalRow;
            hookData.cell.styles.fontStyle = "bold";
          },
        });

        yPosition = (pdf.lastAutoTable?.finalY || yPosition) + lineHeight;
      });

      addNewPageIfNeeded(lineHeight);
      pdf.setFontSize(12);
      pdf.setTextColor(...PDF_THEME.category);
      pdf.text(
        `Total for ${category.category}: Quantity: ${category.total_qty} | Amount: ${Number(
          category.total_amount || 0
        ).toFixed(2)}`,
        margin + 10,
        yPosition
      );
      pdf.setDrawColor(...PDF_THEME.subcategory);
      pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
      yPosition += lineHeight + 10;
    });

    if (data.grand_totals) {
      addNewPageIfNeeded(lineHeight);
      pdf.setFontSize(12);
      pdf.setTextColor(...PDF_THEME.totalBarText);
      pdf.setFillColor(...PDF_THEME.totalBarBg);
      pdf.rect(margin, yPosition - 5, pageWidth - 2 * margin, 25, "F");
      pdf.text(
        `Grand Total Sales Amount: ${Number(data.grand_totals.total_amount || 0).toFixed(2)}`,
        margin + 10,
        yPosition + 10
      );
    }

    return pdf;
  };

  const exportPDF = async () => {
    setPdfLoading(true);
    setError(null);
    try {
      const pdf = await buildPdf();
      pdf.save("sales_summary_report.pdf");
    } catch (err) {
      setError(`Failed to export PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const previewPDF = async () => {
    setPdfLoading(true);
    setError(null);
    try {
      const pdf = await buildPdf();
      window.open(pdf.output("bloburl"), "_blank");
    } catch (err) {
      setError(`Failed to preview PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const exportExcel = () => {
    if (!hasReportData) {
      setError("No data available to export.");
      return;
    }

    const wsData = buildSalesExcelRows(data);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Sales Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([wbout], { type: "application/octet-stream" }),
      "sales_summary_report.xlsx"
    );
  };

  return (
    <div className={`space-y-5 ${darkMode ? "dark" : ""}`}>
      <div className="admin-card overflow-hidden rounded-xl border">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Sales Summary</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">From</p>
                <p className="text-sm font-medium">{startDate}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">To</p>
                <p className="text-sm font-medium">{endDate}</p>
              </div>
              <div className="admin-stat col-span-2 sm:col-span-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Grand Total</p>
                <p className="text-sm font-medium">
                  {data?.grand_totals
                    ? Number(data.grand_totals.total_amount || 0).toFixed(2)
                    : "0.00"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (endDate < next) setEndDate(next);
                }}
                className="h-10 border border-slate-300 dark:border-slate-700 p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm"
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 border border-slate-300 dark:border-slate-700 p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm"
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waiter</span>
              <Select
                isSearchable
                options={waiterOptions}
                value={selectedWaiterOption}
                onChange={(opt) => setWaiterId(opt?.value ?? "")}
                styles={selectThemeStyles}
                placeholder="Search waiter..."
                classNamePrefix="sales-waiter-select"
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                maxMenuHeight={280}
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Table Type</span>
              <select
                value={vipOnly}
                onChange={(e) => setVipOnly(e.target.value)}
                className="h-10 border border-slate-300 dark:border-slate-700 p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm"
              >
                <option value="all">All</option>
                <option value="vip">VIP Only</option>
                <option value="normal">Normal Only</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              type="button"
              onClick={exportPDF}
              className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white px-5 py-2 rounded-lg hover:from-sky-500 hover:to-indigo-500 flex items-center disabled:opacity-50 transition-all shadow-sm"
              disabled={loading || pdfLoading || !hasReportData}
            >
              {pdfLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Exporting...
                </>
              ) : (
                "Export PDF"
              )}
            </button>

            <button
              type="button"
              onClick={previewPDF}
              className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-5 py-2 rounded-lg hover:from-slate-600 hover:to-slate-800 flex items-center disabled:opacity-50 transition-all shadow-sm"
              disabled={loading || pdfLoading || !hasReportData}
            >
              {pdfLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Previewing...
                </>
              ) : (
                "Preview PDF"
              )}
            </button>

            <button
              type="button"
              onClick={exportExcel}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2 rounded-lg hover:from-emerald-500 hover:to-teal-500 flex items-center disabled:opacity-50 transition-all shadow-sm"
              disabled={loading || pdfLoading || !hasReportData}
            >
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="admin-card rounded-xl p-8 flex justify-center items-center text-sm text-slate-500 dark:text-slate-300">
          <Loader2 className="animate-spin h-6 w-6 text-slate-500" />
          <span className="ml-2">Loading report...</span>
        </div>
      )}

      {error && (
        <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/50 p-3 rounded-lg border border-red-200 dark:border-red-800">
          Error: {error}
        </p>
      )}

      {!loading && !error && data && data.report.length === 0 && (
        <p className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
          No sales data available.
        </p>
      )}

      {!loading && !error && hasReportData && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 border-b-2 border-slate-400 pb-2">
            Sales Summary: {data.from} - {data.to}
          </h3>

          {data.report.map((category) => (
            <section
              key={category.category}
              className="admin-card p-5 rounded-lg border"
            >
              <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-3">
                {category.category}
              </h4>

              {category.subcategories.map((subcat) => (
                <div key={subcat.name} className="mb-5">
                  <h5 className="text-base font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {subcat.name}
                  </h5>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gradient-to-r from-slate-900 to-slate-700 text-white">
                          <th className="p-3 text-left font-medium">Item</th>
                          <th className="p-3 text-right font-medium">VIP Status</th>
                          <th className="p-3 text-right font-medium">Quantity</th>
                          <th className="p-3 text-right font-medium">Unit Price</th>
                          <th className="p-3 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subcat.items.map((item) => {
                          const isVoid = item.status === "void";
                          return (
                            <tr key={`${item.menu_item_id}-${item.vip_status}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className={`p-3 text-slate-900 dark:text-slate-100 ${isVoid ? "line-through text-red-600 dark:text-red-400" : ""}`}>
                                {item.name}
                              </td>
                              <td className={`p-3 text-right text-slate-900 dark:text-slate-100 ${isVoid ? "line-through text-red-600 dark:text-red-400" : ""}`}>
                                {item.vip_status}
                              </td>
                              <td className={`p-3 text-right text-slate-900 dark:text-slate-100 ${isVoid ? "line-through text-red-600 dark:text-red-400" : ""}`}>
                                {item.quantity}
                              </td>
                              <td className={`p-3 text-right text-slate-900 dark:text-slate-100 ${isVoid ? "line-through text-red-600 dark:text-red-400" : ""}`}>
                                {Number(item.average_price || 0).toFixed(2)}
                              </td>
                              <td className={`p-3 text-right text-slate-900 dark:text-slate-100 ${isVoid ? "line-through text-red-600 dark:text-red-400" : ""}`}>
                                {Number(item.total_amount || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}

                        <tr className="bg-amber-50 dark:bg-amber-900/30 font-medium">
                          <td className="p-3 text-slate-900 dark:text-slate-100">
                            Subtotal for {subcat.name}
                          </td>
                          <td className="p-3" />
                          <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                            {subcat.total_qty}
                          </td>
                          <td className="p-3" />
                          <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                            {Number(subcat.total_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div className="border-t-2 border-slate-400 pt-2 text-right text-slate-900 dark:text-slate-100">
                Total for {category.category}: Quantity: {category.total_qty} | Amount: {Number(category.total_amount || 0).toFixed(2)}
              </div>
            </section>
          ))}

          {data.grand_totals && (
            <div className="bg-slate-900 dark:bg-slate-800 text-white p-4 rounded-lg text-right font-medium">
              Grand Total Sales Amount: {Number(data.grand_totals.total_amount || 0).toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

