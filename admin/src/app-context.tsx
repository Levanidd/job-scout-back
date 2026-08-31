import { createContext, useCallback, useContext } from "react"

import { UnauthorizedError } from "./api"

export type ToastKind = "ok" | "error"

type AppContextValue = {
  notify: (message: string, kind?: ToastKind) => void
  logout: () => void
  /** Bump to silently refetch whatever tab is open. */
  refreshTick: number
  refresh: () => void
  /** Bump after each source in a cycle so the Sources list can catch up live. */
  sourcesTick: number
  runningSourceId: number | null
}

const AppContext = createContext<AppContextValue | null>(null)

export const AppProvider = AppContext.Provider

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error("useApp must be used inside AppProvider")
  return value
}

/**
 * Wraps an API call so an expired token drops the user back to the token gate
 * instead of surfacing as a generic failure.
 */
export function useAction() {
  const { notify, logout } = useApp()
  return useCallback(
    async <T,>(fn: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      try {
        const result = await fn()
        if (successMessage) notify(successMessage, "ok")
        return result
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          logout()
          return undefined
        }
        notify(error instanceof Error ? error.message : String(error), "error")
        return undefined
      }
    },
    [notify, logout],
  )
}
