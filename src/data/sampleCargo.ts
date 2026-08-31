import type { CargoInput } from '../types'

export const SAMPLE_CARGO: CargoInput[] = [
  { id: 'PAL-A', name: '高密度配件托盘', lengthMm: 1000, widthMm: 800, heightMm: 900, weightKg: 1300, quantity: 8, stopOrder: 3, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 1000 },
  { id: 'BOX-B', name: '轻型周转箱', lengthMm: 1600, widthMm: 1100, heightMm: 1400, weightKg: 150, quantity: 6, stopOrder: 1, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 500 },
  { id: 'RACK-C', name: '立式设备箱', lengthMm: 1000, widthMm: 1000, heightMm: 2000, weightKg: 220, quantity: 5, stopOrder: 2, canRotate: true, keepUpright: true, stackable: false, maxTopLoadKg: 0 },
  { id: 'DENSE-D', name: '工业电机托盘', lengthMm: 1000, widthMm: 800, heightMm: 700, weightKg: 1800, quantity: 4, stopOrder: 3, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 1400 },
  { id: 'CASE-E', name: '精密零件箱', lengthMm: 800, widthMm: 600, heightMm: 700, weightKg: 55, quantity: 10, stopOrder: 1, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 250 },
  { id: 'FRAME-F', name: '大型框架包装', lengthMm: 2400, widthMm: 1100, heightMm: 1600, weightKg: 350, quantity: 5, stopOrder: 2, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 350 },
  { id: 'PAL-G', name: '中型混装托盘', lengthMm: 1200, widthMm: 1000, heightMm: 1300, weightKg: 520, quantity: 6, stopOrder: 2, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 600 },
  { id: 'MACHINE-H', name: '重型机组箱', lengthMm: 1200, widthMm: 1000, heightMm: 900, weightKg: 2500, quantity: 3, stopOrder: 3, canRotate: true, keepUpright: true, stackable: true, maxTopLoadKg: 1500 },
  { id: 'BOX-I', name: '文件与备件箱', lengthMm: 600, widthMm: 400, heightMm: 600, weightKg: 35, quantity: 3, stopOrder: 1, canRotate: true, keepUpright: false, stackable: true, maxTopLoadKg: 120 },
]
