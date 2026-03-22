import React, { createContext, useContext, useState, useEffect } from 'react';
import enTranslations from '../locals/en.json';
import heTranslations from '../locals/he.json';

type Language = 'he' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

// Translation dictionary loaded from JSON files
const translations: Record<Language, Record<string, any>> = {
  he: heTranslations,
  en: enTranslations,
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Load language from localStorage or default to Hebrew
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'he';
  });

  // Update localStorage and document direction when language changes
  useEffect(() => {
    localStorage.setItem('app-language', language);
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    // Support nested keys with dot notation (e.g., 'tripDetails.editFlight')
    const keys = key.split('.');
    let value: any = translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key if not found
      }
    }
    
    return typeof value === 'string' ? value : key;
  };

  const isRTL = language === 'he';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
