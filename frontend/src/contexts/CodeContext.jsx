import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const CodeContext = createContext(null);

export function CodeProvider({ children }) {
  const [codes, setCodes] = useState({});
  const [loaded, setLoaded] = useState(false);

  const fetchCodes = useCallback(() => {
    api.get('/codes')
      .then(res => setCodes(res.data))
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const getCodeName = useCallback((groupCode, code) => {
    const list = codes[groupCode];
    if (!list) return code;
    const found = list.find(c => c.code === code);
    return found ? found.name : code;
  }, [codes]);

  const getCodeColor = useCallback((groupCode, code) => {
    const list = codes[groupCode];
    if (!list) return '';
    const found = list.find(c => c.code === code);
    return found?.description || '';
  }, [codes]);

  const getCodeList = useCallback((groupCode, activeOnly = true) => {
    const list = codes[groupCode] || [];
    if (activeOnly) return list.filter(c => c.is_active);
    return list;
  }, [codes]);

  return (
    <CodeContext.Provider value={{ codes, loaded, getCodeName, getCodeColor, getCodeList, refreshCodes: fetchCodes }}>
      {children}
    </CodeContext.Provider>
  );
}

export function useCode() {
  const ctx = useContext(CodeContext);
  if (!ctx) {
    return {
      codes: {},
      loaded: false,
      getCodeName: (g, c) => c,
      getCodeColor: () => '',
      getCodeList: () => [],
      refreshCodes: () => {},
    };
  }
  return ctx;
}
