import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import KeysPage from '@/pages/KeysPage'
import ApiKeysPage from '@/pages/ApiKeysPage'
import PlaygroundPage from '@/pages/PlaygroundPage'
import FallbackPage from '@/pages/FallbackPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import ModelStatusPage from '@/pages/ModelStatusPage'
import BatchesPage from '@/pages/BatchesPage'

const queryClient = new QueryClient()

function NavItem({ to, children, onNavigate }: { to: string; children: React.ReactNode; onNavigate?: () => void }) {
  return (
    <NavLink to={to} onClick={onNavigate} className={({ isActive }) =>
      `relative text-sm px-1 py-3 lg:py-4 transition-colors ${isActive
        ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-foreground'
        : 'text-muted-foreground hover:text-foreground'}`
    }>
      {children}
    </NavLink>
  )
}

function DarkModeToggle() {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark')
      setDark(true)
    }
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </Button>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
  )
}

function Brand() {
  return <div className="flex items-center gap-2 shrink-0"><span className="inline-block size-2 rounded-full bg-foreground"/><span className="font-semibold tracking-tight text-sm">MyLLM</span></div>
}

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="min-h-screen w-full min-w-0 bg-background overflow-x-hidden">
          <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur border-b">
            <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 flex min-w-0 items-center min-h-14">
              <Brand />
              <nav className="hidden lg:flex items-center gap-5 xl:gap-6 ml-8 xl:ml-10 min-w-0">
                <NavItem to="/playground">Playground</NavItem>
                <NavItem to="/keys">Provider Keys</NavItem>
                <NavItem to="/api-keys">API Keys</NavItem>
                <NavItem to="/fallback">Fallback</NavItem>
                <NavItem to="/analytics">Analytics</NavItem>
                <NavItem to="/model-status">Model Status</NavItem>
                <NavItem to="/batches">Batches</NavItem>
              </nav>
              <div className="ml-auto flex items-center gap-1 py-2 shrink-0">
                <div className="lg:hidden">
                  <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation">
                    <MenuIcon open={mobileMenuOpen} />
                  </Button>
                </div>
                <DarkModeToggle />
              </div>
            </div>
            {mobileMenuOpen && (
              <nav id="mobile-navigation" className="lg:hidden border-t bg-background">
                <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
                  <NavItem to="/playground" onNavigate={() => setMobileMenuOpen(false)}>Playground</NavItem>
                  <NavItem to="/keys" onNavigate={() => setMobileMenuOpen(false)}>Provider Keys</NavItem>
                  <NavItem to="/api-keys" onNavigate={() => setMobileMenuOpen(false)}>API Keys</NavItem>
                  <NavItem to="/fallback" onNavigate={() => setMobileMenuOpen(false)}>Fallback</NavItem>
                  <NavItem to="/analytics" onNavigate={() => setMobileMenuOpen(false)}>Analytics</NavItem>
                  <NavItem to="/model-status" onNavigate={() => setMobileMenuOpen(false)}>Model Status</NavItem>
                  <NavItem to="/batches" onNavigate={() => setMobileMenuOpen(false)}>Batches</NavItem>
                </div>
              </nav>
            )}
          </header>
          <main className="max-w-6xl w-full mx-auto min-w-0 px-4 sm:px-6 py-6 sm:py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/playground" replace />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/keys" element={<KeysPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/fallback" element={<FallbackPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/model-status" element={<ModelStatusPage />} />
              <Route path="/batches" element={<BatchesPage />} />
              <Route path="/test" element={<Navigate to="/playground" replace />} />
              <Route path="/health" element={<Navigate to="/keys" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
