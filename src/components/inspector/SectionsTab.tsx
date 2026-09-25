import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, hexOffset, type AnalysisResult } from "@/lib/binary-analysis";
import { Boxes, Layers, Microchip } from "lucide-react";

function SectionRows({
  rows,
  headers,
}: {
  rows: (string | number)[][];
  headers: string[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h} className="font-mono-tight text-[11px] uppercase tracking-[0.16em]">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i} className="font-mono-tight text-[12.5px]">
            {row.map((cell, j) => (
              <TableCell
                key={j}
                className={j === 0 ? "font-medium text-gold" : "text-foreground/85"}
              >
                {typeof cell === "number" ? formatBytes(cell) : cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SectionsTab({ result }: { result: AnalysisResult }) {
  const e = result.elf;
  const p = result.pe;

  if (e.valid) {
    return (
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-gold" />
            ELF sections ({e.sections.length})
          </CardTitle>
          <CardDescription>
            {e.bitness}-bit · {e.endian}-endian · {e.type} · entry {hexOffset(e.entry)} ·{" "}
            {e.programs.length} program headers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {e.sections.length > 0 ? (
            <SectionRows
              headers={["Name", "Type", "Addr", "Offset", "Size", "Flags"]}
              rows={e.sections.map((s) => [s.name, s.type, hexOffset(s.addr), hexOffset(s.offset), s.size, s.flags])}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Stripped section headers — nothing to list.
            </p>
          )}

          {e.programs.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Boxes className="size-4 text-gold" />
                Program headers (segments)
              </div>
              <SectionRows
                headers={["Type", "Offset", "Virt addr", "File size", "Flags"]}
                rows={e.programs.map((seg) => [
                  seg.type,
                  hexOffset(seg.offset),
                  hexOffset(seg.vaddr),
                  seg.filesz,
                  seg.flags,
                ])}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (p.valid) {
    return (
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-gold" />
            PE sections ({p.sections.length})
          </CardTitle>
          <CardDescription>
            {p.machine} · {p.subsystem} · linked{" "}
            {p.timestamp ? new Date(p.timestamp * 1000).toLocaleString() : "unknown"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {p.sections.length > 0 ? (
            <SectionRows
              headers={["Name", "Virt size", "Virt addr", "Raw size", "Raw offset", "Entropy"]}
              rows={p.sections.map((s) => [
                s.name,
                s.virtualSize,
                hexOffset(s.virtualAddress),
                s.rawSize,
                hexOffset(s.rawOffset),
                s.entropy.toFixed(2),
              ])}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No section table found.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Microchip className="size-4 text-gold" />
          No section table
        </CardTitle>
        <CardDescription>
          This file isn't an ELF or PE image, so there are no sections to list. Raw byte inspection
          is still available in the Hex and Strings tabs.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
