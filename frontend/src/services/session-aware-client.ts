import type { AxiosInstance } from 'axios'
import axios from 'axios'

export const SESSION_INVALID_EVENT = 'case-store-session-invalid'

export function configureSessionAwareClient(client: AxiosInstance) {
    client.interceptors.response.use(
        response => response,
        error => {
            if (axios.isAxiosError<{ code?: string; message?: string }>(error)) {
                const status = error.response?.status
                const code = error.response?.data?.code
                if (status === 401 || (status === 403 && code === 'ACCOUNT_DISABLED')) {
                    window.dispatchEvent(new CustomEvent(SESSION_INVALID_EVENT, {
                        detail: {
                            code,
                            message: code === 'ACCOUNT_DISABLED'
                                ? 'This account has been disabled. Contact support if you believe this is an error.'
                                : 'Your session has expired. Please log in again.'
                        }
                    }))
                }
            }
            return Promise.reject(error)
        }
    )
    return client
}
