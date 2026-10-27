# Candidate 2 rationale

This candidate is react-i18next with namespaced JSON. Language still lives on `user_preferences.locale` and the existing settings blob.

## Chosen

i18next is the lookup engine. `Settings.locale` is the source of truth. `I18nBinder` copies that value into `i18n.changeLanguage` and `<html lang>` before paint. Pages call `useTranslation`. Dates call `formatDate(iso, locale, style)`. Unknown stored tags become `AppLocale` only inside `parseAppLocale`.

The distinctive load-bearing choices are bundled namespaced JSON, typed `t()` from the Korean catalogs, `fallbackLng: 'ko'`, no remount on switch, and `localeUpdatedAt` so a failed push cannot lose to stale remote locale on the next pull.

## Rejected

**Tiny custom locale module** (`AppLocale` union, JSON catalogs, hand-written `t()` and `formatDate`, no new npm deps). That is the other whole shape in this arena. It keeps the dependency list lean. It also leaves fallback, interpolation, subscriber re-render, and missing-key policy as code we would own and slowly reimplement. Rejected here so the arena can compare that shape against a real i18next design instead of a wrapper that pretends to be both.

**Also rejected inside this shape.** A second React context that hides `useTranslation`. `react-intl`. Keying the provider on locale. A new DB table. Putting locale only on the column (breaks guest localStorage) or only on the blob (hides the column mobile already has).
