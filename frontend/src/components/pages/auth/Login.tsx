import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import { authErrorMessage, type LoginInput } from '../../../services/auth'
import './Auth.css'

export default function Login() {
    const { user, login } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [serverError, setServerError] = useState('')
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>()

    if (user) {
        const destination = (location.state as { from?: string } | null)?.from || '/profile'
        return <Navigate to={destination} replace />
    }

    async function submit(input: LoginInput) {
        try {
            setServerError('')
            await login(input)
            const destination = (location.state as { from?: string } | null)?.from || '/profile'
            navigate(destination, { replace: true })
        } catch (error) {
            setServerError(authErrorMessage(error, 'Could not log in. Please try again.'))
        }
    }

    return (
        <section className="auth-page">
            <div className="auth-card">
                <span className="eyebrow">Welcome back</span>
                <h1>Log in</h1>
                <p>Access your profile and continue creating your personalized phone case experience.</p>

                <form onSubmit={handleSubmit(submit)} noValidate>
                    <label htmlFor="login-email">Email</label>
                    <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'login-email-error' : undefined}
                        {...register('email', {
                            required: 'Email is required.',
                            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' }
                        })}
                    />
                    {errors.email && <span id="login-email-error" className="field-error">{errors.email.message}</span>}

                    <label htmlFor="login-password">Password</label>
                    <input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? 'login-password-error' : undefined}
                        {...register('password', { required: 'Password is required.' })}
                    />
                    {errors.password && <span id="login-password-error" className="field-error">{errors.password.message}</span>}

                    {serverError && <p className="error" role="alert">{serverError}</p>}
                    <button className="auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Logging in...' : 'Log in'}
                    </button>
                </form>

                <p className="auth-switch">New here? <Link to="/register">Create an account</Link></p>
            </div>
        </section>
    )
}
