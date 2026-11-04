"""Safe provider diagnostics: never return raw provider payloads or credentials."""
import re


def checkout_error(status_code, result):
    code = result.get('error_code') if isinstance(result, dict) else None
    code = code if isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code) else 'UNKNOWN_ERROR'
    messages = {
        'API_VALIDATION_ERROR': 'Xendit rejected the checkout request fields. Contact support with the payment reference.',
        'INVALID_PAYMENT_CHANNEL': 'No compatible payment channel is available. Check enabled PHP payment channels in the Xendit account.',
        'INVALID_AMOUNT': 'Xendit rejected the payment amount. Contact support with the payment reference.',
        'INVALID_API_KEY': 'Xendit rejected the API key. Check the backend payment configuration.',
    }
    message = messages.get(code)
    if not message:
        if status_code in (401, 403):
            message = 'Xendit denied checkout access. Check the API key permissions and account payment access.'
        elif status_code == 429:
            message = 'Xendit is receiving too many requests. Please try again later.'
        elif status_code >= 500:
            message = 'Xendit is temporarily unavailable. Contact support with the payment reference before retrying.'
        else:
            message = 'Xendit rejected checkout. Contact support with the payment reference.'
    return code, f'{message} (Xendit: {code}; HTTP {status_code})'
