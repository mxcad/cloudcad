import { describe, expect, it, vi } from 'vitest'

vi.mock('./navigateBack', () => ({
  getPcBaseUrl: () => 'http://localhost:3000'
}))

import { buildPcUrlForPath } from './pcTarget'

describe('buildPcUrlForPath', () => {
  it('translates known mobile routes to PC canonical paths', () => {
    expect(buildPcUrlForPath('/shell')).toBe('http://localhost:3000/cad-editor')
    expect(buildPcUrlForPath('/shell/file')).toBe('http://localhost:3000/projects')
    expect(buildPcUrlForPath('/shell/file/project/p-1')).toBe(
      'http://localhost:3000/projects/p-1/files'
    )
    expect(buildPcUrlForPath('/shell/share')).toBe('http://localhost:3000/shares')
    expect(buildPcUrlForPath('/shell/member')).toBe('http://localhost:3000/member-center')
    expect(buildPcUrlForPath('/shell/profile')).toBe('http://localhost:3000/profile')
  })

  it('passes auth pages through unchanged', () => {
    expect(buildPcUrlForPath('/login')).toBe('http://localhost:3000/login')
    expect(buildPcUrlForPath('/register')).toBe('http://localhost:3000/register')
  })

  it('falls back to the raw path when the mobile route has no PC equivalent', () => {
    // 抄来的 PC 路径直接原样交给 PC 路由表，而不是产出 /undefined
    expect(buildPcUrlForPath('/projects/p-1/files')).toBe(
      'http://localhost:3000/projects/p-1/files'
    )
    expect(buildPcUrlForPath('/totally/unknown')).toBe(
      'http://localhost:3000/totally/unknown'
    )
    expect(buildPcUrlForPath('/shell/file/project/p-1/roles')).toBe(
      'http://localhost:3000/shell/file/project/p-1/roles'
    )
  })
})
