'use strict'

/**
 * Test deteksi objek database yang belum ada.
 *
 * LATAR BELAKANG KESALAHAN YANG DIKUNCI
 * Kode sebelumnya mendeteksi "tabel belum ada" dengan pola
 * `/relation|does not exist|42P01/i` yang TIDAK PERNAH cocok, karena backend
 * memakai PostgREST yang mengembalikan kode `PGRST205` dengan pesan
 * "Could not find the table ... in the schema cache".
 *
 * Akibatnya pesan panduan migrasi tidak pernah muncul dan endpoint
 * mengembalikan 500 alih-alih 503. Test ini memastikan kesalahan itu tidak
 * terulang.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { objekBelumAda, KODE_OBJEK_TIDAK_ADA } = require('../src/config/dbError')

test('mengenali error PostgREST saat tabel tidak ada (PGRST205)', () => {
  const err = {
    code: 'PGRST205',
    message: "Could not find the table 'public.audit_log' in the schema cache"
  }
  assert.equal(objekBelumAda(err), true, 'inilah kasus yang dahulu tidak terdeteksi')
})

test('mengenali error PostgREST saat fungsi RPC tidak ada (PGRST202)', () => {
  const err = {
    code: 'PGRST202',
    message: 'Could not find the function public.get_public_kpi in the schema cache'
  }
  assert.equal(objekBelumAda(err), true)
})

test('mengenali error PostgreSQL klasik (42P01 undefined_table)', () => {
  assert.equal(objekBelumAda({ code: '42P01', message: 'relation "x" does not exist' }), true)
})

test('mengenali kolom yang belum ada (42703 undefined_column)', () => {
  assert.equal(
    objekBelumAda({ code: '42703', message: 'column waste_records.is_simulated does not exist' }),
    true
  )
})

test('mengenali dari pesan saja tanpa kode', () => {
  assert.equal(objekBelumAda({ message: "Could not find the table 'public.x' in the schema cache" }), true)
  assert.equal(objekBelumAda({ message: 'relation does not exist' }), true)
})

test('menerima pesan berupa string', () => {
  assert.equal(objekBelumAda("Could not find the table 'public.x' in the schema cache"), true)
})

test('TIDAK salah mengenali pelanggaran kunci unik', () => {
  assert.equal(
    objekBelumAda({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    false
  )
})

test('TIDAK salah mengenali penolakan izin', () => {
  assert.equal(objekBelumAda({ code: '42501', message: 'permission denied for table x' }), false)
})

test('TIDAK salah mengenali kegagalan validasi', () => {
  assert.equal(
    objekBelumAda({ code: '23514', message: 'new row violates check constraint' }),
    false
  )
})

test('null dan undefined menghasilkan false', () => {
  assert.equal(objekBelumAda(null), false)
  assert.equal(objekBelumAda(undefined), false)
  assert.equal(objekBelumAda({}), false)
})

test('daftar kode mencakup PGRST205 — kode yang dahulu terlewat', () => {
  assert.ok(KODE_OBJEK_TIDAK_ADA.has('PGRST205'))
  assert.ok(KODE_OBJEK_TIDAK_ADA.has('PGRST202'))
  assert.ok(KODE_OBJEK_TIDAK_ADA.has('42P01'))
})
