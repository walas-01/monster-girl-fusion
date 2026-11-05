export type Language = 'en' | 'es';

const en = {
  title: 'Monster Girl Fusion', language: 'Language', english: 'English', spanish: 'Español',
  introduction: 'Sign in to your account.', checking: 'Checking your session…',
  signingIn: 'Signing in…', signingOut: 'Signing out…', signedIn: 'You are signed in.',
  logout: 'Sign out', retry: 'Try again',
  usernameLabel: 'Choose your username', usernameSave: 'Save username', savingUsername: 'Saving your username…',
  usernameRules: 'Use 3–20 English letters, numbers, or underscores, with at least one letter or number. Names ignore capitalization when checking availability.',
  usernamePermanent: 'Your username is permanent and cannot be changed.',
  usernameInvalid: 'Enter 3–20 English letters, numbers, or underscores, including at least one letter or number.',
  usernameTaken: 'That username is already taken. Please choose another.',
  usernameAlreadySet: 'Your account already has a username. Please check your session.',
  usernameUnavailable: 'Username setup is temporarily unavailable. Please try again.',
  googleLoading: 'Loading Google sign-in…', googleUnavailable: 'Google sign-in could not load. Please try again.',
  configuration: 'Google sign-in is not configured. Please contact the app owner.',
  unavailable: 'We could not check your session. Please try again.',
  network: 'The request could not be confirmed. Your session has been checked; please try again if needed.',
  security: 'Your session security check failed. Please try again.',
  credential: 'Google sign-in was not accepted. Please sign in again.',
  service: 'Sign-in is temporarily unavailable. Please try again.',
  generic: 'The request could not be completed. Please try again.',
} as const;

export type TextKey = keyof typeof en;
const es: Record<TextKey, string> = {
  title: 'Monster Girl Fusion', language: 'Idioma', english: 'English', spanish: 'Español',
  introduction: 'Inicia sesión en tu cuenta.', checking: 'Comprobando tu sesión…',
  signingIn: 'Iniciando sesión…', signingOut: 'Cerrando sesión…', signedIn: 'Has iniciado sesión.',
  logout: 'Cerrar sesión', retry: 'Reintentar',
  usernameLabel: 'Elige tu nombre de usuario', usernameSave: 'Guardar nombre de usuario', savingUsername: 'Guardando tu nombre de usuario…',
  usernameRules: 'Usa entre 3 y 20 letras inglesas, números o guiones bajos, con al menos una letra o un número. No se distinguen mayúsculas y minúsculas al comprobar la disponibilidad.',
  usernamePermanent: 'Tu nombre de usuario es permanente y no se puede cambiar.',
  usernameInvalid: 'Introduce entre 3 y 20 letras inglesas, números o guiones bajos, con al menos una letra o un número.',
  usernameTaken: 'Ese nombre de usuario ya está en uso. Elige otro.',
  usernameAlreadySet: 'Tu cuenta ya tiene un nombre de usuario. Comprueba tu sesión.',
  usernameUnavailable: 'La configuración del nombre de usuario no está disponible temporalmente. Inténtalo de nuevo.',
  googleLoading: 'Cargando el acceso con Google…', googleUnavailable: 'No se pudo cargar el acceso con Google. Inténtalo de nuevo.',
  configuration: 'El acceso con Google no está configurado. Contacta con el responsable de la aplicación.',
  unavailable: 'No pudimos comprobar tu sesión. Inténtalo de nuevo.',
  network: 'No se pudo confirmar la solicitud. Hemos comprobado tu sesión; inténtalo de nuevo si es necesario.',
  security: 'Falló la comprobación de seguridad de tu sesión. Inténtalo de nuevo.',
  credential: 'No se aceptó el acceso con Google. Vuelve a iniciar sesión.',
  service: 'El acceso no está disponible temporalmente. Inténtalo de nuevo.',
  generic: 'No se pudo completar la solicitud. Inténtalo de nuevo.',
};

export const dictionaries: Record<Language, Record<TextKey, string>> = { en, es };
export const text = (language: Language, key: TextKey) => dictionaries[language][key];

export function initialLanguage(preferences: readonly string[]): Language {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split('-')[0];
    if (language === 'en' || language === 'es') return language;
  }
  return 'en';
}
