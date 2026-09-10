'use client'

import { useEffect, useState } from 'react'
import MenuUploadForm from '../../../components/MenuUploadForm'
import { api } from '../../../lib/api'

export default function MenuPage() {
  const [menus, setMenus] = useState([])

  useEffect(() => {
    api.get('/admin-sekolah/menu').then(setMenus).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Input menu MBG</h1>
      <MenuUploadForm initialMenus={menus} />
    </div>
  )
}
