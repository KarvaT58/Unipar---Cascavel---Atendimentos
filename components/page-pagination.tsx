"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/unipar-ui/button";
import { cn } from "@/lib/utils";

type PagePaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function PagePagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PagePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">Página</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Página anterior"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="flex h-7 min-w-10 items-center justify-center rounded-md border bg-muted/30 px-2 text-sm font-semibold tabular-nums">
          {safePage}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Próxima página"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRightIcon />
        </Button>
        <span className="ml-1 text-xs text-muted-foreground">
          de {safeTotalPages}
        </span>
      </div>
    </div>
  );
}
