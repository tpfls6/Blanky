import { coerceLocale } from '../../i18n/locale.ts';
import { translate } from '../../i18n/translate.ts';
/** A reading-service error in the app's language. Services have no hook, so this reads the language the
 *  app set on the document (applyDocumentLocale); outside a browser it falls back to the default. */
export function readingError(key: string): string {
    return translate(coerceLocale(typeof document === 'undefined' ? undefined : document.documentElement.lang), 'reading.errors.' + key);
}
