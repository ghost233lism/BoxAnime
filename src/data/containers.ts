import type { ContainerSpec } from '../types'

export const CONTAINER_PRESETS: Record<'20GP' | '40GP' | '40HQ', ContainerSpec> = {
  '20GP': {
    id: '20GP',
    name: '20GP 标准干货箱',
    lengthMm: 5898,
    widthMm: 2352,
    heightMm: 2393,
    maxPayloadKg: 28200,
  },
  '40GP': {
    id: '40GP',
    name: '40GP 标准干货箱',
    lengthMm: 12032,
    widthMm: 2352,
    heightMm: 2393,
    maxPayloadKg: 26700,
  },
  '40HQ': {
    id: '40HQ',
    name: '40HQ 高柜',
    lengthMm: 12032,
    widthMm: 2352,
    heightMm: 2698,
    maxPayloadKg: 26500,
  },
}

export const DEFAULT_CONTAINER = CONTAINER_PRESETS['40HQ']
