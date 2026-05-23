export const sectors = [
  {
    code: "TI",
    value: "ti",
    label: "TI - Suporte Técnico",
    description: "Suporte Técnico",
  },
  {
    code: "MAN",
    value: "man",
    label: "MAN - Manutenção",
    description: "Manutenção",
  },
  {
    code: "CSC",
    value: "csc",
    label: "CSC - Coordenações",
    description: "Coordenações",
  },
  {
    code: "CPA",
    value: "cpa",
    label: "CPA - Centro de Psicologia Aplicada",
    description: "Centro de Psicologia Aplicada",
  },
  {
    code: "CAC",
    value: "cac",
    label: "CAC - Sala de Matrículas",
    description: "Sala de Matrículas",
  },
  {
    code: "CIA",
    value: "cia",
    label: "CIA - Secretaria Acadêmica",
    description: "Secretaria Acadêmica",
  },
  {
    code: "SG",
    value: "sg",
    label: "SG - Serviços Gerais",
    description: "Serviços Gerais",
  },
  {
    code: "DIR",
    value: "dir",
    label: "DIR - Direção",
    description: "Direção",
  },
  {
    code: "ODT",
    value: "odt",
    label: "ODT - Odontologia",
    description: "Odontologia",
  },
  {
    code: "CSE",
    value: "cse",
    label: "CSE - Centro de Saúde Escola",
    description: "Centro de Saúde Escola",
  },
  {
    code: "LS",
    value: "ls",
    label: "LS - Laboratórios de Saúde",
    description: "Laboratórios de Saúde",
  },
  {
    code: "AP",
    value: "ap",
    label: "AP - Administrador Predial",
    description: "Administrador Predial",
  },
  {
    code: "PM",
    value: "pm",
    label: "PM - Patrimônio",
    description: "Patrimônio",
  },
  {
    code: "MNT",
    value: "mnt",
    label: "MNT - Monitoramento",
    description: "Monitoramento",
  },
  {
    code: "BB",
    value: "bb",
    label: "BB - Biblioteca",
    description: "Biblioteca",
  },
  {
    code: "SJU",
    value: "sju",
    label: "SJU - Serviço de Assistência Jurídica",
    description: "Serviço de Assistência Jurídica",
  },
  {
    code: "MT",
    value: "mt",
    label: "MT - Motorista",
    description: "Motorista",
  },
  {
    code: "FIN",
    value: "fin",
    label: "FIN - Financeiro",
    description: "Financeiro",
  },
] as const

export type Sector = (typeof sectors)[number]

export const defaultSector = sectors[0]

export const sectorLabels = sectors.reduce<
  Record<string, { code: string; name: string }>
>((labels, sector) => {
  labels[sector.value] = {
    code: sector.code,
    name: sector.description,
  }

  return labels
}, {})

export function getSectorLabel(value?: string | null) {
  return sectorLabels[value ?? ""] ?? sectorLabels[defaultSector.value]
}
