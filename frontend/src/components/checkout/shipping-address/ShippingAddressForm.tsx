import type ShippingAddress from '../../../models/ShippingAddress'
import './ShippingAddressForm.css'

interface Props {
    value: ShippingAddress
    onChange: (value: ShippingAddress) => void
    disabled?: boolean
}

export default function ShippingAddressForm({ value, onChange, disabled }: Props) {
    function update(field: keyof ShippingAddress, nextValue: string) {
        onChange({ ...value, [field]: field === 'countryCode' ? nextValue.toUpperCase() : nextValue })
    }

    return (
        <fieldset className="shipping-address" disabled={disabled}>
            <legend>Shipping address</legend>
            <div className="shipping-grid">
                <label>First name<input required autoComplete="given-name" value={value.firstName} onChange={event => update('firstName', event.target.value)} /></label>
                <label>Last name<input required autoComplete="family-name" value={value.lastName} onChange={event => update('lastName', event.target.value)} /></label>
                <label>Email<input required type="email" autoComplete="email" value={value.email} onChange={event => update('email', event.target.value)} /></label>
                <label>Phone<input required type="tel" autoComplete="tel" value={value.phone} onChange={event => update('phone', event.target.value)} /></label>
                <label className="shipping-wide">Address line 1<input required autoComplete="address-line1" value={value.address1} onChange={event => update('address1', event.target.value)} /></label>
                <label className="shipping-wide">Address line 2 <span>(optional)</span><input autoComplete="address-line2" value={value.address2 ?? ''} onChange={event => update('address2', event.target.value)} /></label>
                <label>City<input required autoComplete="address-level2" value={value.city} onChange={event => update('city', event.target.value)} /></label>
                <label>State / region<input required={['US', 'CA', 'AU'].includes(value.countryCode)} autoComplete="address-level1" value={value.state ?? ''} onChange={event => update('state', event.target.value)} /></label>
                <label>Postal code<input required autoComplete="postal-code" value={value.postalCode} onChange={event => update('postalCode', event.target.value)} /></label>
                <label>Country code<input required maxLength={2} aria-describedby="country-hint" autoComplete="country" value={value.countryCode} onChange={event => update('countryCode', event.target.value)} /><small id="country-hint">Two-letter code, such as US or IL.</small></label>
            </div>
        </fieldset>
    )
}
