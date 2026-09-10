'use client'

import Link from 'next/link'
import Navbar from '../../components/Navbar'
import RouteGuard from '../../components/RouteGuard'

export default function SuperadminLayout({ children }) {
  return (
    <RouteGuard allowedRoles={['superadmin']}>
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-8 grid md:grid-cols-4 gap-8">
        <aside className="space-y-2 text-sm">
          <Link href="/superadmin" className="block text-primary">Ringkasan</Link>
          <Link href="/admin-sekolah" className="block text-primary">Lihat dashboard sekolah</Link>
          <Link href="/dapur-mbg" className="block text-primary">Lihat dashboard SPPG</Link>
        </aside>
        <div className="md:col-span-3 space-y-6">{children}</div>
      </div>
    </RouteGuard>
  )
}
