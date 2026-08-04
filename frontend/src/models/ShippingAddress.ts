export default interface ShippingAddress {
    firstName: string
    lastName: string
    email: string
    phone: string
    address1: string
    address2?: string
    city: string
    state?: string
    postalCode: string
    countryCode: string
}

export const emptyShippingAddress: ShippingAddress = {
    firstName: '', lastName: '', email: '', phone: '', address1: '', address2: '',
    city: '', state: '', postalCode: '', countryCode: 'US'
}

export function isShippingAddressComplete(address: ShippingAddress) {
    const stateRequired = ['US', 'CA', 'AU'].includes(address.countryCode.toUpperCase())
    return Boolean(
        address.firstName.trim() && address.lastName.trim() && address.email.includes('@')
        && address.phone.trim() && address.address1.trim() && address.city.trim()
        && address.postalCode.trim() && /^[A-Za-z]{2}$/.test(address.countryCode)
        && (!stateRequired || address.state?.trim())
    )
}
