import { describe, expect, it } from 'vitest'
import { SAMPLE_CARGO } from '../data/sampleCargo'
import { cargoToCsv, parseCargoFile } from './importCargo'

describe('cargo import', () => {
  it('parses the exported CSV format', async () => {
    const file = new File([cargoToCsv(SAMPLE_CARGO.slice(0, 2))], 'cargo.csv', { type: 'text/csv' })
    const result = await parseCargoFile(file)
    expect(result.cargo).toHaveLength(2)
    expect(result.cargo[0].canRotate).toBe(true)
    expect(result.cargo[0].weightKg).toBe(1300)
  })

  it('accepts a JSON envelope with custom container', async () => {
    const file = new File([JSON.stringify({
      container: { id: 'custom', name: '测试箱', lengthMm: 5000, widthMm: 2000, heightMm: 2000, maxPayloadKg: 10000 },
      cargo: SAMPLE_CARGO.slice(0, 1),
    })], 'cargo.json', { type: 'application/json' })
    const result = await parseCargoFile(file)
    expect(result.container?.name).toBe('测试箱')
    expect(result.cargo[0].id).toBe('PAL-A')
  })

  it('reports invalid dimensions with a row number', async () => {
    const invalid = `id,name,lengthMm,widthMm,heightMm,weightKg,quantity,stopOrder,canRotate,keepUpright,stackable,maxTopLoadKg\nBAD,坏数据,0,800,900,100,1,1,true,true,true,100`
    const file = new File([invalid], 'bad.csv', { type: 'text/csv' })
    await expect(parseCargoFile(file)).rejects.toThrow('第 2 行')
  })
})
