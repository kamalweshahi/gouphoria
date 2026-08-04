import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import type AuthUser from '../models/AuthUser'
import {
    getCurrentUser,
    isInvalidSessionError,
    loginUser,
    logoutUser,
    registerUser,
    type LoginInput,
    type RegisterInput
} from '../services/auth'
import { AuthContext } from './auth-context'
import { SESSION_INVALID_EVENT } from '../services/session-aware-client'

type AuthEventType = 'login' | 'logout' | 'account-changed'

export default function AuthProvider({ children }: PropsWithChildren) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)
    const [restorationError, setRestorationError] = useState<string | null>(null)
    const [sessionVersion, setSessionVersion] = useState(0)
    const restorationStarted = useRef(false)
    const tabId = useRef(crypto.randomUUID())

    const applyUser = useCallback((nextUser: AuthUser | null) => {
        setUser(previous => {
            if (previous?.id !== nextUser?.id || previous?.role !== nextUser?.role || previous?.status !== nextUser?.status) {
                setSessionVersion(value => value + 1)
            }
            return nextUser
        })
    }, [])

    const restoreSession = useCallback(async (clearFirst = false) => {
        setLoading(true)
        setRestorationError(null)
        if (clearFirst) applyUser(null)
        try {
            applyUser(await getCurrentUser())
        } catch (error) {
            if (isInvalidSessionError(error)) applyUser(null)
            else setRestorationError('We could not verify your session. Check your connection and try again.')
        } finally {
            setLoading(false)
        }
    }, [applyUser])

    const broadcast = useCallback((type: AuthEventType) => {
        const event = { type, source: tabId.current, at: Date.now() }
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('case-store-auth')
            channel.postMessage(event)
            channel.close()
        } else {
            try { localStorage.setItem('case-store-auth-event', JSON.stringify(event)) } catch { /* Notifications are best-effort. */ }
        }
    }, [])

    useEffect(() => {
        if (restorationStarted.current) return
        restorationStarted.current = true
        void restoreSession()
    }, [restoreSession])

    useEffect(() => {
        const receive = (event: { type?: string; source?: string }) => {
            if (event.source === tabId.current) return
            if (event.type === 'logout') {
                applyUser(null)
                setRestorationError(null)
                setLoading(false)
                return
            }
            if (event.type === 'login' || event.type === 'account-changed') void restoreSession(true)
        }
        const channel = 'BroadcastChannel' in window ? new BroadcastChannel('case-store-auth') : undefined
        if (channel) channel.onmessage = message => receive(message.data ?? {})
        const storage = (event: StorageEvent) => {
            if (event.key !== 'case-store-auth-event' || !event.newValue) return
            try { receive(JSON.parse(event.newValue)) } catch { /* Ignore malformed non-secret notifications. */ }
        }
        const visibility = () => { if (document.visibilityState === 'visible') void restoreSession(true) }
        window.addEventListener('storage', storage)
        document.addEventListener('visibilitychange', visibility)
        return () => {
            channel?.close()
            window.removeEventListener('storage', storage)
            document.removeEventListener('visibilitychange', visibility)
        }
    }, [applyUser, restoreSession])

    useEffect(() => {
        const invalidSession = (event: Event) => {
            if (!user) return
            const detail = (event as CustomEvent<{ message?: string }>).detail
            applyUser(null)
            setLoading(false)
            setRestorationError(detail?.message || 'Your session has expired. Please log in again.')
            broadcast('logout')
        }
        window.addEventListener(SESSION_INVALID_EVENT, invalidSession)
        return () => window.removeEventListener(SESSION_INVALID_EVENT, invalidSession)
    }, [applyUser, broadcast, user])

    async function register(input: RegisterInput) {
        const next = await registerUser(input)
        setRestorationError(null)
        applyUser(next)
        broadcast('login')
    }

    async function login(input: LoginInput) {
        const previousId = user?.id
        const next = await loginUser(input)
        setRestorationError(null)
        applyUser(next)
        broadcast(previousId && previousId !== next.id ? 'account-changed' : 'login')
    }

    async function logout() {
        setLoading(true)
        setRestorationError(null)
        applyUser(null)
        try {
            await logoutUser()
        } finally {
            setLoading(false)
            broadcast('logout')
        }
    }

    async function refreshUser() {
        await restoreSession()
    }

    return (
        <AuthContext.Provider value={{ user, loading, restorationError, sessionVersion, register, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    )
}
