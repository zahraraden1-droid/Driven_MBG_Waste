import '../styles/globals.css'
import { AuthProvider } from '../context/AuthContext'
import { DemoModeProvider } from '../context/DemoModeContext'

export const metadata = {
  title: 'SPPG MBG',
  description: 'Dashboard pengelolaan limbah pangan sekolah dan budidaya maggot BSF'
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>
          <DemoModeProvider>{children}</DemoModeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
