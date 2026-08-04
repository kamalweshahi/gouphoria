import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import { authErrorMessage, type RegisterInput } from '../../../services/auth'
import './Auth.css'

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/

export default function Register() {
    const { user, register: createAccount } = useAuth()
    const navigate = useNavigate()
    const [serverError, setServerError] = useState('')
    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting }
    } = useForm<RegisterInput>()
    const passwordValue = useWatch({ control, name: 'password' })

    if (user) return <Navigate to="/profile" replace />

    async function submit(input: RegisterInput) {
        try {
            setServerError('')
            await createAccount(input)
            navigate('/profile', { replace: true })
        } catch (error) {
            setServerError(authErrorMessage(error, 'Could not create your account. Please try again.'))
        }
    }

    return (
        <section className="auth-page">
            <div className="auth-card">
                <span className="eyebrow">Your account</span>
                <h1>Create an account</h1>
                <p>Every new account includes one free AI project with an initial design and one revision.</p>

                <form onSubmit={handleSubmit(submit)} noValidate>
                    <label htmlFor="register-name">Name</label>
                    <input
                        id="register-name"
                        autoComplete="name"
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? 'register-name-error' : undefined}
                        {...register('name', {
                            required: 'Name is required.',
                            minLength: { value: 2, message: 'Name must be at least 2 characters.' },
                            maxLength: { value: 120, message: 'Name must be no more than 120 characters.' }
                        })}
                    />
                    {errors.name && <span id="register-name-error" className="field-error">{errors.name.message}</span>}

                    <label htmlFor="register-email">Email</label>
                    <input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'register-email-error' : undefined}
                        {...register('email', {
                            required: 'Email is required.',
                            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' }
                        })}
                    />
                    {errors.email && <span id="register-email-error" className="field-error">{errors.email.message}</span>}

                    <label htmlFor="register-password">Password</label>
                    <input
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        aria-describedby={errors.password ? 'password-help register-password-error' : 'password-help'}
                        aria-invalid={Boolean(errors.password)}
                        {...register('password', {
                            required: 'Password is required.',
                            pattern: {
                                value: strongPassword,
                                message: 'Use at least 10 characters with uppercase, lowercase, and a number.'
                            },
                            maxLength: { value: 128, message: 'Password must be no more than 128 characters.' }
                        })}
                    />
                    <span id="password-help" className="field-help">At least 10 characters, including uppercase, lowercase, and a number.</span>
                    {errors.password && <span id="register-password-error" className="field-error">{errors.password.message}</span>}

                    <label htmlFor="register-confirm-password">Confirm password</label>
                    <input
                        id="register-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={Boolean(errors.confirmPassword)}
                        aria-describedby={errors.confirmPassword ? 'register-confirm-error' : undefined}
                        {...register('confirmPassword', {
                            required: 'Confirm your password.',
                            validate: value => value === passwordValue || 'Passwords do not match.'
                        })}
                    />
                    {errors.confirmPassword && <span id="register-confirm-error" className="field-error">{errors.confirmPassword.message}</span>}

                    {serverError && <p className="error" role="alert">{serverError}</p>}
                    <button className="auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
            </div>
        </section>
    )
}
