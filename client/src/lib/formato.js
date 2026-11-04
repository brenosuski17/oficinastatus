// Datas do SQLite vêm em UTC sem fuso ("2026-11-04 03:12:00")
export const data = (s) => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null)

export const dataHora = (s) =>
  s ? data(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
export const dataCurta = (s) => (s ? data(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '')
export const dia = (s) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''

export const moeda = (v) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export const moedaCurta = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 10000 ? 1 : 0 })

export function tempoDesde(s) {
  const min = Math.round((Date.now() - data(s)) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

export const telefone = (t) => {
  const n = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return t || ''
}

export const marca = (m) => String(m || '').replace(/^.* - /, '')
export const nomeVeiculo = (v) => `${marca(v.marca)} ${v.modelo}`.trim()
export const primeiroNome = (n) => String(n || '').split(' ')[0]
export const iniciais = (n) => String(n || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

export const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
export const limparPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
