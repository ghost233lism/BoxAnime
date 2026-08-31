import Papa from 'papaparse'
import { z } from 'zod'
import { CONTAINER_PRESETS } from '../data/containers'
import type { CargoInput, ContainerSpec } from '../types'

const booleanValue = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', '是'].includes(normalized)) return true
    if (['false', '0', 'no', '否'].includes(normalized)) return false
  }
  return value
}, z.boolean())

const numberValue = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return value
}, z.number().finite().nonnegative())

const positiveNumber = numberValue.refine((value) => value > 0, '必须大于 0')

export const cargoSchema = z.object({
  id: z.coerce.string().trim().min(1, '缺少货物编号'),
  name: z.coerce.string().trim().min(1, '缺少货物名称'),
  lengthMm: positiveNumber,
  widthMm: positiveNumber,
  heightMm: positiveNumber,
  weightKg: positiveNumber,
  quantity: numberValue.pipe(z.number().int().min(1).max(500)),
  stopOrder: numberValue.pipe(z.number().int().min(1).max(99)),
  canRotate: booleanValue,
  keepUpright: booleanValue,
  stackable: booleanValue,
  maxTopLoadKg: numberValue,
})

const containerSchema = z.object({
  id: z.enum(['20GP', '40GP', '40HQ', 'custom']).default('custom'),
  name: z.string().default('自定义容器'),
  lengthMm: positiveNumber,
  widthMm: positiveNumber,
  heightMm: positiveNumber,
  maxPayloadKg: positiveNumber,
  floorLoadWarningKgM2: positiveNumber.optional(),
})

export type ParsedCargoFile = {
  cargo: CargoInput[]
  container?: ContainerSpec
}

function formatIssues(error: z.ZodError, row?: number) {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${row ? `第 ${row} 行` : '数据'} ${issue.path.join('.')}: ${issue.message}`)
    .join('；')
}

function validateCargo(rows: unknown[]) {
  const cargo = rows.map((row, index) => {
    const parsed = cargoSchema.safeParse(row)
    if (!parsed.success) throw new Error(formatIssues(parsed.error, index + 2))
    return parsed.data
  })
  const ids = new Set<string>()
  for (const item of cargo) {
    if (ids.has(item.id)) throw new Error(`货物编号 ${item.id} 重复，请使用唯一 SKU 编号`)
    ids.add(item.id)
  }
  if (cargo.length === 0) throw new Error('文件中没有货物数据')
  if (cargo.reduce((sum, item) => sum + item.quantity, 0) > 500) throw new Error('单次导入最多支持 500 件货物')
  return cargo
}

export async function parseCargoFile(file: File): Promise<ParsedCargoFile> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const source = await file.text()

  if (extension === 'csv') {
    const result = Papa.parse<Record<string, unknown>>(source, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    })
    if (result.errors.length) throw new Error(`CSV 解析失败：${result.errors[0].message}`)
    return { cargo: validateCargo(result.data) }
  }

  if (extension === 'json') {
    let input: unknown
    try {
      input = JSON.parse(source)
    } catch {
      throw new Error('JSON 格式无效，请检查逗号和引号')
    }
    const raw = Array.isArray(input) ? { cargo: input } : input
    const envelope = z.object({ cargo: z.array(z.unknown()), container: z.unknown().optional() }).safeParse(raw)
    if (!envelope.success) throw new Error('JSON 必须是货物数组，或包含 cargo 数组的对象')
    const cargo = validateCargo(envelope.data.cargo)
    if (!envelope.data.container) return { cargo }
    const container = containerSchema.safeParse(envelope.data.container)
    if (!container.success) throw new Error(formatIssues(container.error))
    return { cargo, container: container.data }
  }

  throw new Error('仅支持 .csv 或 .json 文件')
}

export function cargoToCsv(cargo: CargoInput[]) {
  return Papa.unparse(cargo)
}

export function demoJson(cargo: CargoInput[]) {
  return JSON.stringify({ container: CONTAINER_PRESETS['40HQ'], cargo }, null, 2)
}
