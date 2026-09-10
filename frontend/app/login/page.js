'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../context/AuthContext'

const roleRedirect = {
  superadmin: '/superadmin',
  admin_sekolah: '/admin-sekolah',
  dapur_mbg: '/dapur-mbg'
}

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(email, password)
      router.push(roleRedirect[user.role] || '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className="font-display text-2xl mb-6">Masuk ke dashboard</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="hairline rounded-sm p-2 w-full"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="hairline rounded-sm p-2 w-full"
        />
        {error && <p className="text-alert text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-primary text-white rounded-sm py-2 w-full"
        >
          {submitting ? 'Memproses...' : 'Masuk'}
        </button>
      </form>

      <div className="mt-8 text-sm text-primarylight">
        <p className="mb-1">Akun demo saat mode demo aktif</p>
        <p>superadmin@demo.local / demo123</p>
        <p>admin@demo.local / demo123</p>
        <p>dapur@demo.local / demo123</p>
      </div>
    </main>
  )
}
