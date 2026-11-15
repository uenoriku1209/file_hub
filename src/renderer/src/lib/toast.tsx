import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: Kind
  text: string
}

const Ctx = createContext<(kind: Kind, text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'success' ? (
              <CheckCircle2 size={18} />
            ) : t.kind === 'error' ? (
              <AlertCircle size={18} />
            ) : (
              <Info size={18} />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): (kind: Kind, text: string) => void {
  return useContext(Ctx)
}
