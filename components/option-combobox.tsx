"use client"

import * as React from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { SECTOR_OPTIONS, type Sector as AdminSector } from "@/lib/admin-data"
import { sectors } from "@/lib/sectors"
import { cn } from "@/lib/utils"

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  code?: string
  swatchClassName?: string
}

type ComboboxContentProps = React.ComponentProps<typeof ComboboxContent>

const legacySectorDetails: Record<
  string,
  { code: string; label: string; description: string }
> = {
  ti: {
    code: "TI",
    label: "TI - Suporte Tecnico",
    description: "Suporte Tecnico",
  },
  secretaria: {
    code: "CIA",
    label: "CIA - Secretaria Academica",
    description: "Secretaria Academica",
  },
  financeiro: {
    code: "FIN",
    label: "FIN - Financeiro",
    description: "Financeiro",
  },
  "recursos humanos": {
    code: "RH",
    label: "RH - Recursos Humanos",
    description: "Recursos Humanos",
  },
  coordenacao: {
    code: "CSC",
    label: "CSC - Coordenacoes",
    description: "Coordenacoes",
  },
  atendimento: {
    code: "CAC",
    label: "CAC - Sala de Matriculas",
    description: "Sala de Matriculas",
  },
  comercial: {
    code: "COM",
    label: "COM - Comercial",
    description: "Comercial",
  },
  marketing: {
    code: "MKT",
    label: "MKT - Marketing",
    description: "Marketing",
  },
  biblioteca: {
    code: "BB",
    label: "BB - Biblioteca",
    description: "Biblioteca",
  },
  manutencao: {
    code: "MAN",
    label: "MAN - Manutencao",
    description: "Manutencao",
  },
  esterilizacao: {
    code: "EST",
    label: "EST - Esterilizacao",
    description: "Esterilizacao",
  },
}

function normalizeSectorKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

const legacySectorCodeAliases: Record<string, string> = {
  ti: "TI",
  secretaria: "CIA",
  financeiro: "FIN",
  coordenacao: "CSC",
  atendimento: "CAC",
  biblioteca: "BB",
  manutencao: "MAN",
  esterilizacao: "EST",
}

function getSectorDetail(optionValue: string) {
  const normalizedValue = normalizeSectorKey(optionValue)
  const aliasCode = legacySectorCodeAliases[normalizedValue]
  const sector =
    sectors.find((currentSector) => currentSector.code === aliasCode) ??
    sectors.find((currentSector) =>
      [
        currentSector.code,
        currentSector.value,
        currentSector.label,
        currentSector.description,
      ].some((value) => normalizeSectorKey(value) === normalizedValue)
    )

  if (sector) {
    return {
      code: sector.code,
      label: `${sector.code} - ${sector.description}`,
      description: sector.description,
    }
  }

  return legacySectorDetails[normalizedValue]
}

export const accessSectorComboboxOptions: ComboboxOption[] = sectors.map(
  (sector) => ({
    value: sector.value,
    label: sector.label,
    description: sector.description,
    code: sector.code,
  }),
)

const adminSectorValueByAccessSector = {
  ti: "TI",
  man: "Manutenção",
  csc: "Coordenação",
  cpa: "Centro de Psicologia Aplicada",
  cac: "Atendimento",
  cia: "Secretaria",
  sg: "Serviços Gerais",
  dir: "Direção",
  odt: "Odontologia",
  cse: "Centro de Saúde Escola",
  ls: "Laboratórios de Saúde",
  est: "Esterilização",
  ap: "Administrador Predial",
  pm: "Patrimônio",
  mnt: "Monitoramento",
  bb: "Biblioteca",
  sju: "Serviço de Assistência Jurídica",
  mt: "Motorista",
  fin: "Financeiro",
} satisfies Record<(typeof sectors)[number]["value"], AdminSector>

export const workspaceSectorComboboxOptions: ComboboxOption[] = sectors.map(
  (sector) => ({
    value: adminSectorValueByAccessSector[sector.value],
    label: sector.label,
    description: sector.description,
    code: sector.code,
  }),
)

export const legacySectorComboboxOptions: ComboboxOption[] =
  SECTOR_OPTIONS.map((sector) => {
    const detail = getSectorDetail(sector)

    return {
      value: sector,
      label: detail?.label ?? sector,
      description: detail?.description ?? sector,
      code: detail?.code,
    }
  })

type OptionComboboxProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  showClear?: boolean
  contentCollisionAvoidance?: ComboboxContentProps["collisionAvoidance"]
  contentSide?: ComboboxContentProps["side"]
}

export function OptionCombobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  emptyText = "Nenhum item encontrado.",
  className,
  disabled,
  showClear = true,
  contentCollisionAvoidance,
  contentSide = "bottom",
}: OptionComboboxProps) {
  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  return (
    <Combobox
      items={options}
      value={selectedOption}
      onValueChange={(option) => onValueChange(option?.value ?? "")}
      itemToStringValue={(option: ComboboxOption) => option.label}
      isItemEqualToValue={(item: ComboboxOption, selected: ComboboxOption) =>
        item.value === selected.value
      }
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        className={cn("w-full", className)}
        disabled={disabled}
        showClear={showClear}
      />
      <ComboboxContent
        side={contentSide}
        collisionAvoidance={contentCollisionAvoidance}
      >
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(option: ComboboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              <Item size="xs" className="p-0">
                {option.swatchClassName ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-3 w-8 shrink-0 rounded-full",
                      option.swatchClassName
                    )}
                  />
                ) : null}
                <ItemContent>
                  <ItemTitle className="whitespace-normal leading-snug">
                    {option.label}
                  </ItemTitle>
                  {option.description ? (
                    <ItemDescription>
                      {option.description}
                      {option.code ? ` (${option.code})` : ""}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
              </Item>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

type SectorComboboxProps = Omit<OptionComboboxProps, "options" | "emptyText"> & {
  options?: ComboboxOption[]
}

export function SectorCombobox({
  options = accessSectorComboboxOptions,
  placeholder = "Selecione o setor",
  ...props
}: SectorComboboxProps) {
  return (
    <OptionCombobox
      {...props}
      options={options}
      placeholder={placeholder}
      emptyText="Nenhum setor encontrado."
    />
  )
}
