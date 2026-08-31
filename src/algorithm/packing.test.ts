import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTAINER } from '../data/containers'
import { SAMPLE_CARGO } from '../data/sampleCargo'
import type { Placement } from '../types'
import { expandCargo, orientations, solveAllStrategies, solveStrategy } from './packing'

function overlaps(a: Placement, b: Placement) {
  return (
    a.positionMm[0] < b.positionMm[0] + b.sizeMm[0] &&
    a.positionMm[0] + a.sizeMm[0] > b.positionMm[0] &&
    a.positionMm[1] < b.positionMm[1] + b.sizeMm[1] &&
    a.positionMm[1] + a.sizeMm[1] > b.positionMm[1] &&
    a.positionMm[2] < b.positionMm[2] + b.sizeMm[2] &&
    a.positionMm[2] + a.sizeMm[2] > b.positionMm[2]
  )
}

describe('packing engine', () => {
  it('expands quantities into stable instance ids', () => {
    const result = expandCargo([SAMPLE_CARGO[0]])
    expect(result).toHaveLength(8)
    expect(result[0].instanceId).toBe('PAL-A-01')
    expect(result[7].instanceId).toBe('PAL-A-08')
  })

  it('respects upright rotation rules', () => {
    const upright = expandCargo([SAMPLE_CARGO[0]])[0]
    const free = expandCargo([{ ...SAMPLE_CARGO.at(-1)!, lengthMm: 700, widthMm: 500, heightMm: 300 }])[0]
    expect(orientations(upright)).toHaveLength(2)
    expect(orientations(free)).toHaveLength(6)
  })

  it('produces deterministic, collision-free solutions within payload', () => {
    const first = solveStrategy(DEFAULT_CONTAINER, SAMPLE_CARGO, 'balanced', { iterations: 12, seed: 42 }).solution
    const second = solveStrategy(DEFAULT_CONTAINER, SAMPLE_CARGO, 'balanced', { iterations: 12, seed: 42 }).solution
    expect(second).toEqual(first)
    expect(first.metrics.loadedWeightKg).toBeLessThanOrEqual(DEFAULT_CONTAINER.maxPayloadKg)

    for (const placement of first.placements) {
      expect(placement.positionMm[0]).toBeGreaterThanOrEqual(0)
      expect(placement.positionMm[1]).toBeGreaterThanOrEqual(0)
      expect(placement.positionMm[2]).toBeGreaterThanOrEqual(0)
      expect(placement.positionMm[0] + placement.sizeMm[0]).toBeLessThanOrEqual(DEFAULT_CONTAINER.lengthMm)
      expect(placement.positionMm[1] + placement.sizeMm[1]).toBeLessThanOrEqual(DEFAULT_CONTAINER.widthMm)
      expect(placement.positionMm[2] + placement.sizeMm[2]).toBeLessThanOrEqual(DEFAULT_CONTAINER.heightMm)
      expect(placement.supportRatio).toBeGreaterThanOrEqual(0.7)
    }
    for (let a = 0; a < first.placements.length; a += 1) {
      for (let b = a + 1; b < first.placements.length; b += 1) {
        expect(overlaps(first.placements[a], first.placements[b])).toBe(false)
      }
    }
  })

  it('creates meaningfully different multi-objective plans', () => {
    const { solutions } = solveAllStrategies(DEFAULT_CONTAINER, SAMPLE_CARGO, { iterations: 20, seed: 20260831 })
    expect(solutions.volume.metrics.volumeUtilization).toBeGreaterThan(solutions.weight.metrics.volumeUtilization)
    expect(solutions.weight.metrics.weightUtilization).toBeGreaterThan(solutions.volume.metrics.weightUtilization)
    expect(solutions.volume.unloadedCargoIds.length).toBeGreaterThan(0)
    expect(solutions.weight.unloadedCargoIds.length).toBeGreaterThan(0)
  })

  it('returns an explicit unloaded list for an impossible item', () => {
    const impossible = [{ ...SAMPLE_CARGO[0], id: 'TOO-BIG', quantity: 1, lengthMm: 99_000 }]
    const result = solveStrategy(DEFAULT_CONTAINER, impossible, 'volume', { iterations: 2 }).solution
    expect(result.placements).toHaveLength(0)
    expect(result.unloadedCargoIds).toEqual(['TOO-BIG-01'])
  })
})
