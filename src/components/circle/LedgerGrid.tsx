"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Button, dateTimeLabel, money } from "../ui";

ModuleRegistry.registerModules([AllCommunityModule]);

export type LedgerRow = {
  id: string;
  at: string;
  round: number;
  type: string;
  direction: string;
  amount: number;
  currency: string;
  member: string;
  reference: string;
  note: string;
  actor: string;
};

// Colours point at the page's own tokens, so the grid follows light and dark mode.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--color-sheet)",
  foregroundColor: "var(--color-ink)",
  headerBackgroundColor: "var(--color-paper-2)",
  headerTextColor: "var(--color-ink-2)",
  borderColor: "var(--color-rule)",
  rowHoverColor: "var(--color-paper)",
  accentColor: "var(--color-clay)",
  browserColorScheme: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontWeight: 600,
  headerFontSize: 12,
  wrapperBorderRadius: 6,
  cellHorizontalPadding: 12,
});

/** The circle ledger as an AG Grid table: sort, filter, export. */
export function LedgerGrid({ rows }: { rows: LedgerRow[] }) {
  const t = useTranslations("ledger");
  const locale = useLocale();
  const grid = useRef<AgGridReact<LedgerRow>>(null);

  const columns = useMemo<ColDef<LedgerRow>[]>(
    () => [
      { field: "at", headerName: t("columns.at"), valueFormatter: (p) => dateTimeLabel(p.value as string, locale), sort: "desc", minWidth: 150 },
      { field: "round", headerName: t("columns.round"), width: 90, minWidth: 80, cellClass: "tnum text-ink" },
      { field: "type", headerName: t("columns.type"), valueFormatter: (p) => t(`types.${p.value as string}`), minWidth: 150 },
      {
        field: "amount",
        headerName: t("columns.amount"),
        type: "rightAligned",
        valueFormatter: (p) => `${p.data?.direction === "out" ? "−" : "+"}${money(p.value as number, p.data?.currency ?? "USD", locale)}`,
        cellClass: (p) => (p.data?.direction === "out" ? "tnum text-clay" : "tnum text-moss"),
        width: 150,
      },
      { field: "member", headerName: t("columns.member"), minWidth: 140 },
      { field: "reference", headerName: t("columns.reference"), minWidth: 240, flex: 1, cellClass: "font-mono text-xs" },
      { field: "note", headerName: t("columns.note"), minWidth: 200, flex: 1 },
      { field: "actor", headerName: t("columns.actor"), width: 120 },
    ],
    [t, locale],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" className="px-3 py-1.5" onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "nouba-ledger.csv" })}>
          {t("export")}
        </Button>
      </div>
      <div className="nouba-grid" style={{ width: "100%" }}>
        <AgGridReact<LedgerRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          domLayout="autoHeight"
          autoSizeStrategy={{ type: "fitGridWidth", defaultMinWidth: 110 }}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[10, 25, 50, 100]}
          enableRtl={locale === "ar"}
          getRowId={(p) => p.data.id}
        />
      </div>
    </div>
  );
}
