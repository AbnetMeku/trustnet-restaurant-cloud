/** Unit normalization and conversion for inventory stock entry and display. */

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function normalizeUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  if (value === "liter" || value === "litre") return "l";
  return value;
}

export function isShotTrackedItem(item) {
  const perBottle = Number(item?.shots_per_bottle || 0);
  const stockUnit = normalizeUnit(item?.stock_unit || item?.unit);
  return stockUnit === "bottle" && perBottle > 0;
}

export function entryUnitOptionsForStockUnit(stockUnit) {
  const unit = normalizeUnit(stockUnit);
  if (unit === "kg" || unit === "g") {
    return [
      { value: "kg", label: "kg" },
      { value: "g", label: "g" },
    ];
  }
  if (unit === "l" || unit === "ml") {
    return [
      { value: "l", label: "l" },
      { value: "ml", label: "ml" },
    ];
  }
  if (unit === "piece") {
    return [{ value: "piece", label: "piece" }];
  }
  return [];
}

export function defaultEntryUnitForStockUnit(stockUnit) {
  return normalizeUnit(stockUnit) || "kg";
}

export function hasEntryUnitToggle(stockUnit) {
  const options = entryUnitOptionsForStockUnit(stockUnit);
  return options.length > 1;
}

export function entryStepForUnit(entryUnit) {
  const unit = normalizeUnit(entryUnit);
  if (unit === "kg" || unit === "l") return "0.001";
  return "1";
}

export function convertToStockUnit(amount, fromUnit, stockUnit) {
  const fromU = normalizeUnit(fromUnit);
  const toU = normalizeUnit(stockUnit);
  const value = Number(amount || 0);

  if (fromU === toU) return value;

  if (fromU === "g" && toU === "kg") return value / 1000;
  if (fromU === "kg" && toU === "g") return value * 1000;

  if (fromU === "ml" && toU === "l") return value / 1000;
  if (fromU === "l" && toU === "ml") return value * 1000;

  if ((fromU === "piece" || fromU === "bottle") && (toU === "piece" || toU === "bottle")) {
    return value;
  }

  throw new Error(`Cannot convert ${fromU} to ${toU}`);
}

export function convertFromStockUnit(stockAmount, toEntryUnit, stockUnit) {
  return convertToStockUnit(stockAmount, stockUnit, toEntryUnit);
}

export function formatShotDisplay(value, shotsPerBottle) {
  const total = Number(value || 0);
  const perBottle = Number(shotsPerBottle || 0);
  if (!Number.isFinite(perBottle) || perBottle <= 0) {
    return numberFormat.format(total);
  }
  if (total < 0) {
    return numberFormat.format(total);
  }
  let bottles = Math.floor(total / perBottle);
  let shots = Math.round(total - bottles * perBottle);
  if (shots >= perBottle) {
    bottles += 1;
    shots = 0;
  }
  const parts = [];
  if (bottles > 0) parts.push(`${bottles} bottle${bottles === 1 ? "" : "s"}`);
  if (shots > 0 || parts.length === 0) parts.push(`${shots} shot${shots === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function formatQuantityForItem(quantity, item, { includeUnit = true } = {}) {
  if (!item) {
    const formatted = numberFormat.format(Number(quantity || 0));
    return includeUnit ? formatted : formatted;
  }

  const perBottle = Number(item.shots_per_bottle || 0);
  if (isShotTrackedItem(item)) {
    return formatShotDisplay(quantity, perBottle);
  }

  const stockUnit = normalizeUnit(item.stock_unit || item.unit) || "unit";
  const formatted = numberFormat.format(Number(quantity || 0));
  if (!includeUnit) return formatted;
  return `${formatted} ${stockUnit}`;
}

export function inventoryOptionLabel(item, stockQty) {
  if (isShotTrackedItem(item)) {
    const itemShots = Number(item.shots_per_bottle || 0);
    return `${item.name} | ${itemShots} shots/bottle | ${stockQty} shots in store`;
  }
  const stockUnit = normalizeUnit(item.stock_unit || item.unit) || "unit";
  return `${item.name} | ${stockUnit} | ${formatQuantityForItem(stockQty, item)} in store`;
}

export function resolveEntryQuantity({
  item,
  quantity,
  entryUnit,
  bottles,
  looseShots,
}) {
  if (!item) return NaN;

  if (isShotTrackedItem(item)) {
    const shotsPerBottle = Number(item.shots_per_bottle || 0);
    const parsedBottles = Number(bottles || 0);
    const parsedLooseShots = Number(looseShots || 0);
    return (
      (Number.isFinite(parsedBottles) ? parsedBottles : 0) * shotsPerBottle +
      (Number.isFinite(parsedLooseShots) ? parsedLooseShots : 0)
    );
  }

  const parsedQuantity = Number(quantity || 0);
  if (!Number.isFinite(parsedQuantity)) return NaN;

  const stockUnit = normalizeUnit(item.stock_unit || item.unit);
  if (!stockUnit || stockUnit === "bottle") return parsedQuantity;

  try {
    return convertToStockUnit(parsedQuantity, entryUnit || defaultEntryUnitForStockUnit(stockUnit), stockUnit);
  } catch {
    return NaN;
  }
}

export function quantityToFormFields(storedQuantity, item, preferredEntryUnit) {
  if (!item) {
    return { quantity: String(storedQuantity ?? ""), entry_unit: "kg" };
  }

  if (isShotTrackedItem(item)) {
    const itemShots = Number(item.shots_per_bottle || 0);
    const qty = Number(storedQuantity || 0);
    const bottles = Math.floor(qty / itemShots);
    const looseShots = Number((qty - bottles * itemShots).toFixed(3));
    return {
      quantity: "",
      entry_unit: defaultEntryUnitForStockUnit(item.stock_unit),
      bottles: String(bottles),
      loose_shots: String(looseShots || ""),
    };
  }

  const stockUnit = normalizeUnit(item.stock_unit || item.unit);
  const entryUnit = preferredEntryUnit || defaultEntryUnitForStockUnit(stockUnit);
  const displayQty = convertFromStockUnit(Number(storedQuantity || 0), entryUnit, stockUnit);
  const rounded = Math.round(displayQty * 1000) / 1000;
  return {
    quantity: Number.isInteger(rounded) ? String(rounded) : String(rounded),
    entry_unit: entryUnit,
    bottles: "",
    loose_shots: "",
  };
}
