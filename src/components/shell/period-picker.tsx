"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  parsePeriod,
  resolvePeriod,
  toISODate,
  writePeriod,
  type Period,
  type PeriodPreset,
} from "@/lib/period";

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = parsePeriod(searchParams);
  const resolved = resolvePeriod(period);

  function apply(next: Period) {
    const params = writePeriod(new URLSearchParams(searchParams), next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function changePreset(preset: PeriodPreset) {
    apply(
      preset === "personalizado"
        ? { preset, from: toISODate(resolved.start), to: toISODate(resolved.end) }
        : { preset },
    );
  }

  function changeBoundary(boundary: "from" | "to", value: string) {
    if (period.preset !== "personalizado" || !value) return;
    apply({ ...period, [boundary]: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="valor text-num-sm text-texto" aria-live="polite">
        {resolved.label}
      </p>

      <Select
        aria-label="Período"
        value={period.preset}
        onChange={(event) => changePreset(event.target.value as PeriodPreset)}
        className="h-8 w-auto text-sm"
      >
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {PERIOD_LABELS[preset]}
          </option>
        ))}
      </Select>

      {period.preset === "personalizado" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="Início do período"
            value={period.from}
            max={period.to}
            onChange={(event) => changeBoundary("from", event.target.value)}
            className="valor border-linha bg-superficie text-num-sm text-texto h-8 rounded-md border px-2"
          />
          <span aria-hidden className="text-texto-fraco">
            –
          </span>
          <input
            type="date"
            aria-label="Fim do período"
            value={period.to}
            min={period.from}
            onChange={(event) => changeBoundary("to", event.target.value)}
            className="valor border-linha bg-superficie text-num-sm text-texto h-8 rounded-md border px-2"
          />
        </div>
      )}
    </div>
  );
}
